import express, { Request, Response } from 'express';
import crypto from 'crypto';
import User from '../models/User';
import Shop from '../models/Shop';
import jwt from 'jsonwebtoken';
import { MailService } from '../services/MailService';
import { protect } from '../middleware/auth';

const router = express.Router();

if (!process.env.JWT_SECRET) {
  if ((process.env.NODE_ENV === 'production' || process.env.RENDER === 'true')) {
    throw new Error('FATAL: JWT_SECRET environment variable is required. Server cannot start without it.');
  } else {
    console.warn("WARNING: JWT_SECRET environment variable is not set. Using 'fallback_secret_stuffy' as development default.");
    process.env.JWT_SECRET = 'fallback_secret_stuffy';
  }
}

const generateToken = (id: any) => {
  return jwt.sign({ id }, process.env.JWT_SECRET!, { expiresIn: '30d' });
};

router.post('/register', async (req: Request, res: Response) => {
  const { name, email, password, role: requestedRole } = req.body;

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const count = await User.countDocuments();
    let role = count === 0 ? 'admin' : 'user';
    if (requestedRole === 'seller') {
      role = 'seller';
    }

    const emailVerificationToken = crypto.randomBytes(20).toString('hex');
    const emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;

    const user = await User.create({ 
      name, 
      email, 
      password, 
      role, 
      emailVerificationToken, 
      emailVerificationExpires 
    });

    await MailService.sendVerificationEmail(email, emailVerificationToken);

    if (user) {
      if (role === 'seller') {
        await Shop.create({
          name: `${user.name}'s Shop`,
          owner: user._id,
          description: `Welcome to ${user.name}'s Shop`,
          tenantId: user.tenantId || 'default_store'
        });
      }
      const token = generateToken(user._id);
      
      res.cookie('jwt', token, {
        httpOnly: true,
        secure: (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'),
        sameSite: (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000
      });

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        coinsBalance: user.coinsBalance || 0,
        token,
      });
    } else {
      res.status(400).json({ error: 'Invalid user data' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user && (await (user as any).matchPassword(password))) {
      const token = generateToken(user._id);

      res.cookie('jwt', token, {
        httpOnly: true,
        secure: (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'),
        sameSite: (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000
      });

      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        coinsBalance: user.coinsBalance || 0,
        token,
      });
    } else {
      res.status(401).json({ error: 'Invalid email or password' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

router.get('/me', protect, async (req: any, res: Response) => {
  try {
    const user = await User.findById(req.user._id);
    if (user) {
      const token = generateToken(user._id);
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        coinsBalance: user.coinsBalance || 0,
        token,
      });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error retrieving profile' });
  }
});

router.put('/profile', protect, async (req: any, res: Response) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.name = req.body.name || user.name;
    if (req.body.email) user.email = req.body.email;

    const updatedUser = await user.save();
    const token = generateToken(updatedUser._id);
    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      coinsBalance: updatedUser.coinsBalance || 0,
      token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

router.put('/password', protect, async (req: any, res: Response) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    const isMatch = await (user as any).matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error changing password' });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  res.cookie('jwt', '', {
    httpOnly: true,
    expires: new Date(0)
  });
  res.status(200).json({ message: 'Logged out successfully' });
});

router.get('/verify/:token', async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({
      emailVerificationToken: req.params.token,
      emailVerificationExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verification Link Invalid or Expired</title>
          <style>
            body {
              background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
              color: #f8fafc;
              font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .card {
              background: rgba(30, 41, 59, 0.7);
              backdrop-filter: blur(12px);
              border: 1px solid rgba(255, 255, 255, 0.1);
              padding: 2.5rem;
              border-radius: 1.5rem;
              text-align: center;
              max-width: 450px;
              box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3);
            }
            .icon {
              font-size: 4rem;
              color: #ef4444;
              margin-bottom: 1rem;
            }
            h1 {
              font-size: 1.8rem;
              margin-bottom: 0.5rem;
              background: linear-gradient(to right, #f87171, #ef4444);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
            }
            p {
              color: #94a3b8;
              line-height: 1.6;
              margin-bottom: 2rem;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✗</div>
            <h1>Verification Failed</h1>
            <p>The verification link is invalid or has expired. Please try registering again or contact support.</p>
          </div>
        </body>
        </html>
      `);
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.setHeader('Content-Type', 'text/html');
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verified Successfully - Stuffy Supermarket</title>
        <style>
          body {
            background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
            color: #f8fafc;
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          .card {
            background: rgba(30, 41, 59, 0.7);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            padding: 2.5rem;
            border-radius: 1.5rem;
            text-align: center;
            max-width: 450px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3);
            transform: translateY(0);
            transition: all 0.3s ease;
          }
          .icon {
            font-size: 4rem;
            color: #10b981;
            margin-bottom: 1rem;
            animation: scaleIn 0.5s ease-out;
          }
          h1 {
            font-size: 1.8rem;
            margin-bottom: 0.5rem;
            background: linear-gradient(to right, #34d399, #059669);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          p {
            color: #94a3b8;
            line-height: 1.6;
            margin-bottom: 2rem;
          }
          .btn {
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            color: white;
            border: none;
            padding: 0.8rem 2rem;
            font-size: 1rem;
            font-weight: 600;
            border-radius: 0.75rem;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.4);
          }
          @keyframes scaleIn {
            0% { transform: scale(0); }
            100% { transform: scale(1); }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✓</div>
          <h1>Email Verified!</h1>
          <p>Thank you. Your email address has been successfully verified. You can now access all features of Stuffy Supermarket.</p>
          <a href="http://localhost:3000/login" class="btn">Go to Stuffy Store</a>
        </div>
      </body>
      </html>
    `);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Server error during email verification' });
  }
});

export default router;
