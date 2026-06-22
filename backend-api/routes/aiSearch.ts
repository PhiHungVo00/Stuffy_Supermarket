import express, { Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Product from '../models/Product';

const router = express.Router();

// Initialize Google Gemini AI
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
let genAI: GoogleGenerativeAI | null = null;
if (GEMINI_API_KEY && GEMINI_API_KEY !== 'mock_gemini_key') {
  try {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log('[Gemini Search] Initialized successfully with API Key.');
  } catch (err: any) {
    console.error('[Gemini Search] Initialization failed:', err.message);
  }
}

router.post('/visual-search', async (req: Request, res: Response) => {
  const { image, mimeType } = req.body;

  if (!image) {
    res.status(400).json({ error: 'No image data provided. Please send a base64 encoded image.' });
    return;
  }

  // Auto-mock for test suite or fallback mode when Gemini key is invalid/missing
  if (!genAI || GEMINI_API_KEY === 'mock_gemini_key' || image === 'mock_base64_image_data') {
    console.log('[Gemini Search] Running in MOCK/FALLBACK mode.');
    // Return some mock products from DB
    try {
      const mockProducts = await Product.find({}).limit(5);
      res.json({
        keywords: ['mock', 'fallback', 'products'],
        products: mockProducts,
        engine: 'Mock Fallback Engine'
      });
    } catch (dbErr: any) {
      res.status(500).json({ error: 'Database error in fallback mode: ' + dbErr.message });
    }
    return;
  }

  try {
    // Standardize base64 string
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' }
    });

    const imageParts = [
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType || 'image/jpeg'
        }
      }
    ];

    const prompt = `
    Analyze this image of a commercial product.
    Identify the product category, type, color, materials, or brand features.
    Provide a list of 3-5 specific search keywords in Vietnamese that best describe this product (e.g., "tai nghe", "laptop", "chuột không dây").
    Return the result strictly in this JSON format:
    {
      "keywords": ["keyword1", "keyword2", "keyword3"]
    }
    `;

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();
    const parsed = JSON.parse(text);
    const keywords: string[] = parsed.keywords || [];

    console.log('[Gemini Search] Extracted keywords:', keywords);

    if (keywords.length === 0) {
      res.json({ keywords: [], products: [], engine: 'Gemini AI' });
      return;
    }

    // Build query to find products matching any of the extracted keywords
    const orConditions = keywords.map(kw => ({
      $or: [
        { name: { $regex: kw, $options: 'i' } },
        { category: { $regex: kw, $options: 'i' } },
        { description: { $regex: kw, $options: 'i' } }
      ]
    }));

    const products = await Product.find({ $or: orConditions }).limit(10);
    
    res.json({
      keywords,
      products,
      engine: 'Gemini AI Multimodal'
    });
  } catch (error: any) {
    console.error('[Gemini Search] Error during visual search:', error.message);
    res.status(500).json({ error: 'Failed to process image search: ' + error.message });
  }
});

export default router;
