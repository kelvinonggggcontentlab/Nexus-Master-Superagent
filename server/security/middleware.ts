import { Request, Response, NextFunction } from 'express';
import { securityManager, NexusSession, NexusUser } from './index';

// Extend Express Request type with authenticated session and user
declare global {
  namespace Express {
    interface Request {
      nexusSession?: NexusSession;
      nexusUser?: NexusUser;
      userId?: string;
    }
  }
}

export const SESSION_COOKIE_NAME = '__Host-nexus_session';
export const FALLBACK_COOKIE_NAME = 'nexus_session';

/**
 * Parses raw Cookie header into key-value map without extra external dependencies
 */
function parseCookies(req: Request): Record<string, string> {
  const list: Record<string, string> = {};
  const rc = req.headers.cookie;
  if (!rc) return list;

  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join('='));
    }
  });
  return list;
}

/**
 * Extracts session ID from HttpOnly cookie or Authorization: Session <id> or Bearer header
 */
export function extractSessionId(req: Request): string | null {
  const cookies = parseCookies(req);
  if (cookies[SESSION_COOKIE_NAME]) return cookies[SESSION_COOKIE_NAME];
  if (cookies[FALLBACK_COOKIE_NAME]) return cookies[FALLBACK_COOKIE_NAME];

  const authHeader = req.headers.authorization;
  if (authHeader) {
    if (authHeader.startsWith('Session ')) {
      return authHeader.substring(8).trim();
    }
    // If client passes token in X-Nexus-Session header
    const nexusHeader = req.headers['x-nexus-session'];
    if (typeof nexusHeader === 'string') return nexusHeader;
  }

  const customHeader = req.headers['x-nexus-session'];
  if (typeof customHeader === 'string') return customHeader;

  return null;
}

/**
 * Middleware: Enforces server-side authentication for protected routes.
 * Rejects missing or invalid sessions with 401.
 * Rejects locked users with 423 (Locked) or 403.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionId = extractSessionId(req);
  if (!sessionId) {
    securityManager.logAuditEvent({
      type: 'failed_authentication',
      details: { path: req.path, reason: 'missing_session_credentials' },
      ip: req.ip,
    });
    return res.status(401).json({
      error: 'Authentication required. Please authenticate via the NEXUS Security Gateway.',
      code: 'UNAUTHENTICATED',
    });
  }

  const validation = securityManager.validateSession(sessionId);
  if (!validation.valid || !validation.session) {
    securityManager.logAuditEvent({
      type: 'failed_authentication',
      sessionId,
      details: { path: req.path, reason: validation.reason || 'invalid_session' },
      ip: req.ip,
    });

    if (validation.reason === 'emergency_locked') {
      return res.status(403).json({
        error: 'NEXUS EMERGENCY LOCK IS ACTIVE. All operations are halted.',
        code: 'EMERGENCY_LOCKED',
      });
    }

    if (validation.reason === 'idle_timeout') {
      return res.status(401).json({
        error: 'Session timed out due to inactivity. Re-authentication required.',
        code: 'SESSION_IDLE_TIMEOUT',
      });
    }

    return res.status(401).json({
      error: 'Session invalid or expired. Please re-authenticate.',
      code: 'SESSION_EXPIRED',
    });
  }

  const user = securityManager.getUser(validation.session.userId);
  if (!user) {
    return res.status(403).json({ error: 'User account not found', code: 'USER_NOT_FOUND' });
  }

  // Attach strictly request-scoped user context
  req.nexusSession = validation.session;
  req.nexusUser = user;
  req.userId = user.id;

  next();
}

/**
 * Middleware: Rate limiter token bucket
 */
export function rateLimit(limit: number, windowMs: number, keyPrefix = 'rl') {
  return (req: Request, res: Response, next: NextFunction) => {
    const identifier = req.userId || req.ip || 'anonymous';
    const key = `${keyPrefix}:${identifier}`;

    const { allowed, remaining, resetInMs } = securityManager.checkRateLimit(key, limit, windowMs);
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetInMs / 1000));

    if (!allowed) {
      securityManager.logAuditEvent({
        type: 'rate_limit_exceeded',
        userId: req.userId,
        details: { path: req.path, limit, windowMs },
        ip: req.ip,
      });
      return res.status(429).json({
        error: 'Too many requests. Please slow down.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds: Math.ceil(resetInMs / 1000),
      });
    }

    next();
  };
}

/**
 * Production Security Headers Middleware
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // 1. Prevent MIME Sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 2. Clickjacking Protection
  // In AI Studio iframe preview, allow same-origin or iframe embedding where permitted,
  // but strictly deny framing on sensitive standalone endpoints.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // 3. Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 4. Permissions Policy
  res.setHeader('Permissions-Policy', 'microphone=(self), geolocation=(), camera=()');

  // 5. Cache-Control for protected APIs to prevent sensitive data leaks in intermediate caches
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  // 6. Content Security Policy (allows necessary inline styles, wasm for crypto, and Google APIs)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://accounts.google.com https://*.firebaseapp.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com data:; " +
      "img-src 'self' data: https: blob:; " +
      "connect-src 'self' https://generativelanguage.googleapis.com https://www.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.firebaseio.com wss: ws:; " +
      "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com;"
  );

  next();
}
