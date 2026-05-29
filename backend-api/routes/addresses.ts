import express, { Response } from 'express';
import Address from '../models/Address';
import { protect } from '../middleware/auth';

const router = express.Router();

router.get('/', protect, async (req: any, res: Response) => {
  try {
    const addresses = await Address.find({ user: req.user._id }).sort({ isDefault: -1, createdAt: -1 });
    res.json(addresses);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching addresses' });
  }
});

router.post('/', protect, async (req: any, res: Response) => {
  try {
    const { label, address, city, postalCode, country, phone, isDefault } = req.body;

    if (!address || !city || !postalCode || !country) {
      return res.status(400).json({ error: 'Address, city, postalCode, and country are required' });
    }

    if (isDefault) {
      await Address.updateMany({ user: req.user._id }, { isDefault: false });
    }

    const newAddress = await Address.create({
      user: req.user._id,
      label: label || 'Home',
      address,
      city,
      postalCode,
      country,
      phone: phone || '',
      isDefault: isDefault || false,
    });

    res.status(201).json(newAddress);
  } catch (error) {
    res.status(500).json({ error: 'Server error creating address' });
  }
});

router.put('/:id', protect, async (req: any, res: Response) => {
  try {
    const addr = await Address.findOne({ _id: req.params.id, user: req.user._id });
    if (!addr) return res.status(404).json({ error: 'Address not found' });

    const { label, address, city, postalCode, country, phone, isDefault } = req.body;

    if (isDefault) {
      await Address.updateMany({ user: req.user._id, _id: { $ne: req.params.id } }, { isDefault: false });
    }

    addr.label = label ?? addr.label;
    addr.address = address ?? addr.address;
    addr.city = city ?? addr.city;
    addr.postalCode = postalCode ?? addr.postalCode;
    addr.country = country ?? addr.country;
    addr.phone = phone ?? addr.phone;
    addr.isDefault = isDefault ?? addr.isDefault;

    const updated = await addr.save();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Server error updating address' });
  }
});

router.delete('/:id', protect, async (req: any, res: Response) => {
  try {
    const addr = await Address.findOne({ _id: req.params.id, user: req.user._id });
    if (!addr) return res.status(404).json({ error: 'Address not found' });

    await Address.deleteOne({ _id: req.params.id });
    res.json({ message: 'Address removed' });
  } catch (error) {
    res.status(500).json({ error: 'Server error deleting address' });
  }
});

export default router;
