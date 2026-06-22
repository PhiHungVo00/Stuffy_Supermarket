import Product from '../models/Product';
import { clearCache } from '../redis';

let isChangeStreamActive = false;

export const handleProductChange = async (productId: string) => {
  console.log(`[CDC Cache Invalidation] Product change detected for ID: ${productId}. Clearing cache...`);
  await clearCache(`product:${productId}`);
  await clearCache('products:*');
};

export const initCacheInvalidation = () => {
  try {
    const productStream = Product.watch();
    
    productStream.on('change', async (change) => {
      isChangeStreamActive = true;
      console.log('[CDC Cache Invalidation] Change Stream event received:', change.operationType);
      
      const documentKey = (change as any).documentKey;
      if (documentKey && documentKey._id) {
        const productId = documentKey._id.toString();
        await handleProductChange(productId);
      }
    });

    productStream.on('error', (err) => {
      console.warn('[CDC Cache Invalidation] Change Stream encountered an error (likely standalone MongoDB):', err.message);
      isChangeStreamActive = false;
    });

    console.log('[CDC Cache Invalidation] MongoDB Change Streams registered successfully.');
  } catch (err: any) {
    console.warn('[CDC Cache Invalidation] Could not start MongoDB Change Stream:', err.message);
    isChangeStreamActive = false;
  }
};

export const getIsChangeStreamActive = () => isChangeStreamActive;
