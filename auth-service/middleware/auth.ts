import jwt from 'jsonwebtoken';
import User from '../models/User';
import { Request, Response, NextFunction } from 'express';

// Extend Express Request type
interface AuthRequest extends Request {
  user?: any;
  tenantId?: string;
}

/**
 * Enterprise Auth Middleware: 
 * Supports both standalone JWT and OIDC Access Tokens (Keycloak-ready).
 * Also handles Tenant Context for SaaS multi-tenancy.
 */
export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
  let token: string | undefined;

  // 1. Extract Tenant Identity (SaaS support)
  req.tenantId = (req.headers['x-tenant-id'] as string) || 'default_store';

  // 1. Extract Token (Authorization Header or Cookie)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authorized, no identity token' });
  }

  try {
    // 2. Token Verification (Enterprise Mode)
    // Note: In production, instead of a secret, we should verify against Keycloak's JWKS URI
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);
    
    // 3. User Resolution
    // If it's a social/SSO login, the ID might be a UUID from Keycloak/OIDC
    req.user = await User.findById(decoded.id).select('-password');
    
    if (!req.user) {
      return res.status(401).json({ error: 'User not found. Account may have been deleted.' });
    }

    next();
  } catch (error: any) {
    console.error('[EnterpriseAuth] Verification failed:', error.message);
    res.status(401).json({ error: 'Identity verification failed. Please login via SSO.' });
  }
};

export const admin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user && (req.user.role === 'admin' || req.user.isAdmin)) {
    next();
  } else {
    res.status(403).json({ error: 'Insufficient permissions. Admin role required.' });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authorized, no identity token' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Insufficient permissions. Role '${req.user.role}' is not authorized.` });
    }
    next();
  };
};
