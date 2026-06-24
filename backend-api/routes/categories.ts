import express, { Request, Response } from 'express';
import Category from '../models/Category';
import { protect, admin } from '../middleware/auth';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default_store';
    const categories = await Category.find({ tenantId }).read('secondaryPreferred').sort({ level: 1, name: 1 });

    const buildTree = (cats: any[], parentId: string | null = null): any[] => {
      return cats
        .filter(c => String(c.parent || null) === String(parentId))
        .map(c => ({
          _id: c._id,
          name: c.name,
          slug: c.slug,
          image: c.image,
          level: c.level,
          children: buildTree(cats, String(c._id)),
        }));
    };

    const tree = buildTree(categories);
    res.json({ categories, tree });
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching categories' });
  }
});

router.post('/', protect, admin, async (req: any, res: Response) => {
  try {
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default_store';
    const { name, slug, parent, image } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'Name and slug are required' });
    }

    let level = 0;
    if (parent) {
      const parentCat = await Category.findById(parent).read('secondaryPreferred');
      if (parentCat) level = parentCat.level + 1;
    }

    const category = await Category.create({ name, slug, parent: parent || null, image: image || '', level, tenantId });
    res.status(201).json(category);
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Category slug already exists for this tenant' });
    }
    res.status(500).json({ error: 'Server error creating category' });
  }
});

router.put('/:id', protect, admin, async (req: any, res: Response) => {
  try {
    const category = await Category.findById(req.params.id).read('secondaryPreferred');
    if (!category) return res.status(404).json({ error: 'Category not found' });

    const { name, slug, parent, image } = req.body;
    category.name = name ?? category.name;
    category.slug = slug ?? category.slug;
    category.image = image ?? category.image;

    if (parent !== undefined) {
      category.parent = parent || null;
      if (parent) {
        const parentCat = await Category.findById(parent).read('secondaryPreferred');
        category.level = parentCat ? parentCat.level + 1 : 0;
      } else {
        category.level = 0;
      }
    }

    const updated = await category.save();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Server error updating category' });
  }
});

router.delete('/:id', protect, admin, async (req: any, res: Response) => {
  try {
    const category = await Category.findById(req.params.id).read('secondaryPreferred');
    if (!category) return res.status(404).json({ error: 'Category not found' });

    const collectDescendantIds = async (parentId: string): Promise<string[]> => {
      const children = await Category.find({ parent: parentId }).read('secondaryPreferred').select('_id');
      let ids: string[] = children.map(c => String(c._id));
      for (const child of children) {
        const grandChildren = await collectDescendantIds(String(child._id));
        ids = ids.concat(grandChildren);
      }
      return ids;
    };

    const descendantIds = await collectDescendantIds(req.params.id);
    await Category.deleteMany({ _id: { $in: [...descendantIds, req.params.id] } });
    res.json({ message: 'Category and all descendants removed' });
  } catch (error) {
    res.status(500).json({ error: 'Server error deleting category' });
  }
});

export default router;
