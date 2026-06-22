import express, { Response } from 'express';
import { protect } from '../middleware/auth';
import ChatMessage from '../models/ChatMessage';
import User from '../models/User';
import Shop from '../models/Shop';

const router = express.Router();

// GET /api/chat/history/:partnerId - Fetch message history with a partner
router.get('/history/:partnerId', protect, async (req: any, res: Response) => {
  try {
    const userId = req.user._id;
    const { partnerId } = req.params;

    // Fetch messages sorted by time
    const messages = await ChatMessage.find({
      $or: [
        { sender: userId, recipient: partnerId },
        { sender: partnerId, recipient: userId }
      ]
    }).sort({ createdAt: 1 })
      .populate({ path: 'attachedProduct', select: 'name price image category countInStock' })
      .populate({ path: 'attachedOrder', select: '_id itemsPrice totalPrice status createdAt paymentMethod' });

    // Mark incoming messages as read
    await ChatMessage.updateMany(
      { sender: partnerId, recipient: userId, isRead: false },
      { $set: { isRead: true } }
    );

    res.json(messages);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error fetching chat history' });
  }
});

// GET /api/chat/rooms - List all conversation rooms for the logged-in user
router.get('/rooms', protect, async (req: any, res: Response) => {
  try {
    const userId = req.user._id;

    // Aggregate chat messages to group by conversation partner
    const rooms = await ChatMessage.aggregate([
      {
        $match: {
          $or: [
            { sender: userId },
            { recipient: userId }
          ]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: {
              if: { $eq: ['$sender', userId] },
              then: '$recipient',
              else: '$sender'
            }
          },
          lastMessage: { $first: '$message' },
          lastMessageTime: { $first: '$createdAt' },
          unreadCount: {
            $sum: {
              $cond: {
                if: {
                  $and: [
                    { $eq: ['$recipient', userId] },
                    { $eq: ['$isRead', false] }
                  ]
                },
                then: 1,
                else: 0
              }
            }
          }
        }
      },
      {
        $sort: { lastMessageTime: -1 }
      }
    ]);

    // Populate user details for each partner
    const populatedRooms: any[] = await User.populate(rooms, {
      path: '_id',
      select: 'name email role'
    });

    // Match shops for partners who are sellers
    const finalRooms = [];
    for (const room of populatedRooms) {
      const partner = room._id;
      if (!partner) continue;

      let shop = null;
      if ((partner as any).role === 'seller') {
        shop = await Shop.findOne({ owner: partner._id }).select('name logo');
      }

      finalRooms.push({
        partner,
        shop,
        lastMessage: room.lastMessage,
        lastMessageTime: room.lastMessageTime,
        unreadCount: room.unreadCount
      });
    }

    res.json(finalRooms);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error fetching chat rooms' });
  }
});

export default router;
