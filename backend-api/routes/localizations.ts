import express, { Request, Response } from 'express';
import Localization from '../models/Localization';
import { getCachedData, cacheData, clearCache } from '../redis';
import { protect, admin } from '../middleware/auth';

const router = express.Router();

// GET /api/localization/:lang
// Returns key-value pairs formatted as { [key]: value }
router.get('/:lang', async (req: Request, res: Response) => {
  try {
    const { lang } = req.params;
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default_store';

    if (lang !== 'en' && lang !== 'vi') {
      return res.status(400).json({ error: 'Unsupported language. Only "en" and "vi" are supported.' });
    }

    const cacheKey = `localization:${tenantId}:${lang}`;
    const cached = await getCachedData<Record<string, string>>(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    // Read from DB using CQRS (read replica if possible, secondaryPreferred)
    const localizations = await Localization.find({ lang, tenantId }).read('secondaryPreferred');
    
    // Transform into { key: value }
    const dictionary: Record<string, string> = {};
    localizations.forEach((item: any) => {
      dictionary[item.key] = item.value;
    });

    // Cache results for 24 hours (86400 seconds)
    await cacheData(cacheKey, dictionary, 86400);

    res.json(dictionary);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error fetching localization data' });
  }
});

// POST /api/localization/update
// Upsert localization key-value pair and clear cache
router.post('/update', protect, admin, async (req: any, res: Response) => {
  try {
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default_store';
    const { lang, key, value } = req.body;

    if (!lang || !key || value === undefined) {
      return res.status(400).json({ error: 'lang, key, and value are required' });
    }

    if (lang !== 'en' && lang !== 'vi') {
      return res.status(400).json({ error: 'Unsupported language. Only "en" and "vi" are supported.' });
    }

    // Upsert key-value in database
    await Localization.findOneAndUpdate(
      { lang, key, tenantId },
      { value },
      { upsert: true, new: true }
    );

    // Clear localization cache for this tenant and language
    const cacheKey = `localization:${tenantId}:${lang}`;
    await clearCache(cacheKey);

    res.json({ message: 'Localization updated successfully', lang, key, value });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error updating localization data' });
  }
});

export default router;
