import { Request, Response, NextFunction } from 'express';
import Product from '../models/Product';

const BOT_USER_AGENTS = [
  'googlebot',
  'bingbot',
  'yandexbot',
  'baiduspider',
  'twitterbot',
  'facebookexternalhit',
  'rogerbot',
  'linkedinbot',
  'embedly',
  'quora link preview',
  'showyoubot',
  'outbrain',
  'pinterest/0.',
  'developers.google.com/+/web/snippet'
];

export const seoPrerender = async (req: Request, res: Response, next: NextFunction) => {
  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  
  // Check if request is from a search engine bot
  const isBot = BOT_USER_AGENTS.some(bot => userAgent.includes(bot));
  
  if (!isBot) {
    return next();
  }

  const url = req.originalUrl || req.url;
  console.log(`[SEO Prerender] Bot detected: ${userAgent}. Path: ${url}`);

  // Handle product detail pages (e.g. /products/:id or /api/products/:id)
  const productPathRegex = /(?:\/products\/|\/api\/products\/)([a-f\d]{24})/i;
  const match = url.match(productPathRegex);

  if (match && match[1]) {
    const productId = match[1];
    try {
      // Fetch product data from MongoDB using CQRS read preferred
      const product = await Product.findById(productId).read('secondaryPreferred');
      
      if (!product) {
        return res.status(404).send('Product not found');
      }

      // Generate HTML with complete static SEO Meta tags
      const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <title>${product.name} | Stuffy Supermarket</title>
    <meta name="description" content="${product.description || 'Mua sắm ngay ' + product.name + ' với giá tốt nhất tại Stuffy Supermarket.'}">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="product">
    <meta property="og:title" content="${product.name} | Stuffy Supermarket">
    <meta property="og:description" content="${product.description || ''}">
    <meta property="og:image" content="${product.image}">
    <meta property="og:url" content="${req.protocol}://${req.get('host')}/products/${product._id}">
    
    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:title" content="${product.name} | Stuffy Supermarket">
    <meta property="twitter:description" content="${product.description || ''}">
    <meta property="twitter:image" content="${product.image}">
    
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; max-width: 800px; margin: 0 auto; line-height: 1.6; }
      .product-container { display: flex; gap: 30px; margin-top: 20px; }
      img { max-width: 300px; height: auto; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
      .price { font-size: 1.5rem; color: #ef4444; font-weight: 800; margin: 10px 0; }
      .category { background: #e2e8f0; padding: 4px 10px; border-radius: 99px; font-size: 0.82rem; display: inline-block; font-weight: 700; }
    </style>
</head>
<body>
    <div class="category">${product.category}</div>
    <h1>${product.name}</h1>
    <div class="product-container">
        <div>
            <img src="${product.image}" alt="${product.name}" />
        </div>
        <div>
            <div class="price">$${product.price}</div>
            <p><strong>Mô tả sản phẩm:</strong></p>
            <p>${product.description || 'Không có mô tả sản phẩm.'}</p>
        </div>
    </div>
</body>
</html>
      `.trim();

      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    } catch (err: any) {
      console.error('[SEO Prerender] Error rendering static page:', err.message);
      return res.status(500).send('Internal Server Error');
    }
  }

  next();
};
