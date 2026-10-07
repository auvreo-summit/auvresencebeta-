import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser } from '../db/queries.ts';
import { ProfileStorageError, databaseFailure } from '../db/errors.ts';

export interface AuthenticatedUser {
  id: number;
  uid: string;
  email: string;
  displayName: string;
  institution: string | null;
  activeRole: string;
  isDemoSeed: boolean;
}

export interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
    name?: string;
    authSource: 'firebase' | 'showcase_hmac';
  };
  dbUser?: AuthenticatedUser;
}

export const RECOGNISED_DEMO_UIDS = new Set([
  'auvresence-demo-participant-shaurya',
  'auvresence-demo-organiser-arjun',
]);

export function isShowcaseModeEnabled(): boolean {
  const raw = process.env.SHOWCASE_MODE ?? 'false';
  return raw.trim().toLowerCase() === 'true';
}

// Synthetic identities are an explicit development/test facility, not a
// consequence of enabling the clean judge-facing showcase presentation.
export function areDemoIdentitiesEnabled(): boolean {
  return isShowcaseModeEnabled() && process.env.ENABLE_DEMO_IDENTITIES === 'true';
}

export function areDebugToolsEnabled(): boolean {
  return areDemoIdentitiesEnabled() && process.env.SHOWCASE_DEBUG === 'true';
}

// Runtime server-only HMAC secret for showcase session tokens
const SHOWCASE_TOKEN_SECRET = crypto.randomBytes(32).toString('hex');

export function createShowcaseToken(payload: {
  uid: string;
  email: string;
  name: string;
  exp: number;
}): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SHOWCASE_TOKEN_SECRET)
    .update(data)
    .digest('base64url');
  return `auv_sig_${data}.${sig}`;
}

export function verifyShowcaseToken(token: string): {
  uid: string;
  email: string;
  name: string;
  exp: number;
} | null {
  if (!areDemoIdentitiesEnabled()) return null;
  if (!token.startsWith('auv_sig_')) return null;
  const raw = token.slice('auv_sig_'.length);
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SHOWCASE_TOKEN_SECRET)
    .update(data)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    if (!RECOGNISED_DEMO_UIDS.has(parsed.uid)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.user && req.dbUser) return next();
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized: Missing Bearer authentication token.',
      code: 'AUTHENTICATION_FAILED',
      layer: 'LAYER_1_IDENTITY',
    });
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized: Empty authentication token.',
      code: 'AUTHENTICATION_FAILED',
      layer: 'LAYER_1_IDENTITY',
    });
  }

  try {
    // 1. Check if token is a server-signed showcase session token (only allowed when SHOWCASE_MODE=true)
    if (token.startsWith('auv_sig_')) {
      if (!areDemoIdentitiesEnabled()) {
        return res.status(403).json({
          error: 'Showcase demo sessions are disabled in this environment.',
          layer: 'LAYER_1_IDENTITY',
        });
      }
      const verified = verifyShowcaseToken(token);
      if (!verified) {
        return res.status(401).json({
          error: 'Unauthorized: Invalid or expired showcase session token.',
          layer: 'LAYER_1_IDENTITY',
        });
      }
      req.user = {
        uid: verified.uid,
        email: verified.email,
        name: verified.name,
        authSource: 'showcase_hmac',
      };
      const dbUser = await getOrCreateUser(
        verified.uid,
        verified.email,
        verified.name,
        true
      );
      req.dbUser = dbUser;
      return next();
    }

    // 2. Otherwise verify Firebase ID token via Firebase Admin SDK
    const decodedToken = await adminAuth.verifyIdToken(token);
    const email = decodedToken.email || `${decodedToken.uid}@firebase.user`;
    const name =
      decodedToken.name ||
      email
        .split('@')[0]
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

    req.user = {
      uid: decodedToken.uid,
      email,
      name,
      authSource: 'firebase',
    };

    const dbUser = await getOrCreateUser(decodedToken.uid, email, name, false);
    req.dbUser = dbUser;
    return next();
  } catch (error) {
    if (error instanceof ProfileStorageError) {
      console.error('Authenticated profile storage failed:', error);
      const failure = databaseFailure(error);
      return res.status(failure?.status || 503).json(failure || { code: 'PROFILE_UNAVAILABLE', error: 'Your identity is verified, but your profile could not be loaded. Please try again.' });
    }
    console.error('Error verifying authentication token:', error);
    return res.status(401).json({
      error: 'Unauthorized: Invalid or unverified identity token.',
      code: 'AUTHENTICATION_FAILED',
      layer: 'LAYER_1_IDENTITY',
    });
  }
};

export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.headers.authorization) return next();
  return requireAuth(req, res, next);
};
