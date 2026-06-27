import CircuitBreaker from 'opossum';
import axios from 'axios';
import jwt from 'jsonwebtoken';

const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
const INTERNAL_SECRET = process.env.STUFFY_INTERNAL_SECRET || 'stuffy_secret_2026';
const IMAGE_SERVICE_URL = process.env.IMAGE_SERVICE_URL || (isProduction 
    ? 'https://stuffy-image-service.onrender.com' 
    : 'http://localhost:3019');

const generateInternalToken = () => {
    return jwt.sign({ 
        iss: 'stuffy-gateway', 
        scope: 'internal_access' 
    }, INTERNAL_SECRET, { expiresIn: '60s' });
};

const fetchOptimizedImage = async (url: string, width: number, quality: number) => {
  const target = `${IMAGE_SERVICE_URL}/optimize?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`;
  const token = generateInternalToken();
  
  const response = await axios.get(target, { 
    responseType: 'arraybuffer',
    timeout: 3000,
    headers: {
        'X-Internal-Service-Auth': `Bearer ${token}` // 🛡️ Zero-Trust Inter-service Auth
    }
  });
  return response.data;
};

// 🛡️ Circuit Breaker Options
const options = {
  timeout: 5000,           // Maximum time for the function to resolve
  errorThresholdPercentage: 50, // Fail if 50% of requests fail
  resetTimeout: 30000      // Wait 30s before trying again (Half-Open)
};

const breaker = new CircuitBreaker(fetchOptimizedImage, options);

// 🎨 Fallback Action
breaker.fallback(() => {
  console.warn("[CircuitBreaker] 🚨 Image Service IS DOWN! 🚧 Serving Fallback Assets.");
  // Provide a beautiful, high-quality placeholder image if the microservice is dead
  return "https://images.unsplash.com/photo-1594322436404-5a0526db4d13?q=80&w=800&auto=format&fit=crop"; 
});

breaker.on('open', () => console.error(`[Resilience] 🔓 Circuit OPEN for ImageService. Stopping all requests.`));
breaker.on('close', () => console.info(`[Resilience] 🔒 Circuit CLOSED for ImageService. Resuming normal operations.`));
breaker.on('halfOpen', () => console.log(`[Resilience] 🌓 Circuit HALF-OPEN. Testing ImageService health...`));

export const getResilientImage = async (url: string, width: number = 800, quality: number = 80) => {
    return await breaker.fire(url, width, quality);
};
