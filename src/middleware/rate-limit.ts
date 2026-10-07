import type { Request, Response, NextFunction } from 'express';

export function createRateLimiter(limit = 30, windowMs = 60_000, now = Date.now) {
  const buckets = new Map<string, { count: number; expires: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const time = now();
    // IP comes from the actual socket; forwarded headers are not trusted.
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    for (const [ip, bucket] of buckets) if (bucket.expires <= time) buckets.delete(ip);
    const bucket = buckets.get(key) || { count: 0, expires: time + windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.expires - time) / 1000)));
      return res.status(429).json({ code: 'AI_RATE_LIMITED', error: 'Please wait a moment before asking again.' });
    }
    next();
  };
}
