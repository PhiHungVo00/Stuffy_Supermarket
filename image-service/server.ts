import express, { type Request, type Response, type NextFunction } from 'express';
import sharp from 'sharp';
import axios from 'axios';
import cors from 'cors';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const CACHE_DIR = path.join(__dirname, 'cache');
const INTERNAL_SECRET = process.env.STUFFY_INTERNAL_SECRET || 'stuffy_secret_2026';

/**
 * 🛡️ ZERO TRUST MIDDLEWARE
 * Rejects any request that doesn't originate from our authenticated Gateway.
 */
const interServiceAuth = (req: Request, res: Response, next: any) => {
    const authHeader = req.headers['x-internal-service-auth'] as string;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error("[ZeroTrust] ❌ Blocked unauthorized external request.");
        return res.status(401).send('Unauthorized Service Call');
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).send('Broken Auth Token');
    
    try {
        jwt.verify(token, INTERNAL_SECRET as string);
        next();
    } catch (e) {
        console.error("[ZeroTrust] ❌ Token verification failed.");
        return res.status(401).send('Invalid Internal Token');
    }
};

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

app.use(cors());

app.get('/health', (req, res) => res.send('OK'));

app.get('/optimize', interServiceAuth, async (req: Request, res: Response) => {
  const imageUrl = req.query.url as string;
  const width = parseInt(req.query.w as string) || 800;
  const quality = parseInt(req.query.q as string) || 80;

  if (!imageUrl) {
    return res.status(400).send('Image URL is required');
  }

  // Create hash for caching
  const hash = crypto.createHash('md5').update(`${imageUrl}-${width}-${quality}`).digest('hex');
  const cachePath = path.join(CACHE_DIR, `${hash}.webp`);

  if (fs.existsSync(cachePath)) {
    console.log(`[Cache Hit] Serving optimized image: ${hash}`);
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return fs.createReadStream(cachePath).pipe(res);
  }

  try {
    console.log(`[Optimize] Fetching and processing: ${imageUrl}`);
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    // Optimize using Sharp
    const optimizedBuffer = await sharp(buffer)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

    // Cache the result
    fs.writeFileSync(cachePath, optimizedBuffer);

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(optimizedBuffer);
  } catch (err: any) {
    console.error('[Error] Image optimization failed:', err.message);
    res.status(500).send('Failed to process image');
  }
});

const PORT = process.env.PORT || 3019;
app.listen(Number(PORT), () => {
  console.log(`[Image Optimization Service] Running at http://localhost:${PORT}`);
  console.log(`[Cache] Directory: ${CACHE_DIR}`);
});
