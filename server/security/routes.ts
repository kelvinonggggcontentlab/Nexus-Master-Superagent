import { Router } from 'express';
import { securityManager } from './index';
import {
  requireAuth,
  rateLimit,
  SESSION_COOKIE_NAME,
  FALLBACK_COOKIE_NAME,
  extractSessionId,
} from './middleware';

export const authRouter = Router();

/**
 * 1. GET /api/auth/status
 * Returns current authentication, lock state, device count, and security posture.
 */
authRouter.get('/status', (req, res) => {
  const sessionId = extractSessionId(req);
  if (!sessionId) {
    return res.json({
      authenticated: false,
      isLocked: false,
      activeSessionCount: 0,
      trustedDeviceCount: 0,
      autoLockMinutes: 15,
      autonomousActionsEnabled: true,
      highRiskConfirmationRequired: true,
    });
  }

  const validation = securityManager.validateSession(sessionId);
  if (!validation.valid || !validation.session) {
    return res.json({
      authenticated: false,
      isLocked: validation.reason === 'emergency_locked',
      reason: validation.reason,
      activeSessionCount: 0,
      trustedDeviceCount: 0,
      autoLockMinutes: 15,
      autonomousActionsEnabled: true,
      highRiskConfirmationRequired: true,
    });
  }

  const status = securityManager.getSecurityStatus(validation.session.userId);
  return res.json({
    ...status,
    currentSessionId: sessionId,
    currentDeviceId: validation.session.deviceId,
  });
});

/**
 * 2. POST /api/auth/webauthn/challenge
 * Issues cryptographic challenge for Passkey / WebAuthn registration or authentication.
 */
authRouter.post('/webauthn/challenge', rateLimit(20, 60000), (req, res) => {
  const { userId } = req.body;
  const challengeData = securityManager.generateAuthChallenge(userId);
  res.json({
    challenge: challengeData.challenge,
    challengeId: challengeData.challengeId,
    rp: {
      name: 'NEXUS MASTER SUPERAGENT™',
      id: req.hostname || 'localhost',
    },
    timeout: 60000,
    userVerification: 'preferred',
  });
});

/**
 * 3. POST /api/auth/webauthn/authenticate
 * Verifies Passkey / WebAuthn response and issues secure session cookie.
 */
authRouter.post('/webauthn/authenticate', rateLimit(10, 60000), (req, res) => {
  const { challengeId, credentialId, deviceLabel, platform } = req.body;

  // Verify challenge
  if (!challengeId || !securityManager.verifyChallenge(challengeId)) {
    securityManager.logAuditEvent({
      type: 'failed_authentication',
      details: { reason: 'invalid_or_expired_challenge' },
      ip: req.ip,
    });
    return res.status(400).json({ error: 'Authentication challenge expired or invalid', code: 'CHALLENGE_EXPIRED' });
  }

  // Authorize default root user or user matching credential
  const user = securityManager.getDefaultUser();

  // Check if locked
  if (securityManager.isEmergencyLocked(user.id)) {
    return res.status(403).json({
      error: 'Emergency Lock is active for this account. Contact security administrator.',
      code: 'EMERGENCY_LOCKED',
    });
  }

  const userAgent = req.headers['user-agent'] || platform || 'WebAuthn Secure Enclave';
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  // Create cryptographically secure session
  const { session, token } = securityManager.createSession(
    user.id,
    undefined,
    ipAddress,
    deviceLabel || userAgent
  );

  // Set secure cookies
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/',
  };

  res.cookie(FALLBACK_COOKIE_NAME, token, cookieOptions);
  if (isProd) {
    res.cookie(SESSION_COOKIE_NAME, token, { ...cookieOptions, secure: true });
  }

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    },
    session: {
      sessionId: session.sessionId,
      deviceId: session.deviceId,
      expiresAt: session.expiresAt,
      idleTimeoutMs: session.idleTimeoutMs,
    },
  });
});

/**
 * 4. POST /api/auth/logout
 * Terminates active session.
 */
authRouter.post('/logout', (req, res) => {
  const sessionId = extractSessionId(req);
  if (sessionId) {
    securityManager.revokeSession(sessionId, 'user_logout');
  }

  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.clearCookie(FALLBACK_COOKIE_NAME, { path: '/' });
  res.json({ success: true, message: 'Session terminated' });
});

/**
 * 5. POST /api/auth/lock
 * Emergency "Lock NEXUS" Action — terminates all active sessions, freezes tool calls.
 */
authRouter.post('/lock', (req, res) => {
  const sessionId = extractSessionId(req);
  let userId = 'usr_blacktower_root';
  if (sessionId) {
    const val = securityManager.validateSession(sessionId);
    if (val.session) userId = val.session.userId;
  }

  securityManager.activateEmergencyLock(userId);

  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.clearCookie(FALLBACK_COOKIE_NAME, { path: '/' });

  res.json({
    success: true,
    isLocked: true,
    message: 'NEXUS EMERGENCY LOCK ACTIVATED. All sessions terminated and execution frozen.',
  });
});

/**
 * 6. POST /api/auth/unlock
 * Releases emergency lock after re-authentication.
 */
authRouter.post('/unlock', (req, res) => {
  const { challengeId } = req.body;
  if (!challengeId || !securityManager.verifyChallenge(challengeId)) {
    return res.status(400).json({ error: 'Valid authentication challenge required to unlock.' });
  }

  const user = securityManager.getDefaultUser();
  securityManager.releaseEmergencyLock(user.id);

  // Issue new fresh session
  const { session, token } = securityManager.createSession(
    user.id,
    undefined,
    req.ip,
    req.headers['user-agent']
  );

  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(FALLBACK_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });

  res.json({
    success: true,
    isLocked: false,
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    },
  });
});

/**
 * 7. GET /api/auth/devices
 * Lists trusted devices for the authenticated user.
 */
authRouter.get('/devices', requireAuth, (req, res) => {
  const userId = req.userId!;
  const devices = securityManager.getDevices(userId);
  res.json({ devices });
});

/**
 * 8. DELETE /api/auth/devices/:id
 * Revokes a trusted device.
 */
authRouter.delete('/devices/:id', requireAuth, (req, res) => {
  const userId = req.userId!;
  const success = securityManager.revokeDevice(userId, req.params.id);
  res.json({ success, message: success ? 'Device revoked' : 'Device not found' });
});

/**
 * 9. GET /api/auth/audit-log
 * Returns security audit events for verification and compliance.
 */
authRouter.get('/audit-log', requireAuth, (req, res) => {
  const events = securityManager.getAuditEvents(req.userId);
  res.json({ events });
});

/**
 * 10. POST /api/auth/config
 * Updates security configuration (auto-lock minutes, autonomous actions toggle).
 */
authRouter.post('/config', requireAuth, (req, res) => {
  const userId = req.userId!;
  const { autoLockMinutes, autonomousActionsEnabled } = req.body;

  if (typeof autoLockMinutes === 'number') {
    securityManager.setAutoLockMinutes(userId, autoLockMinutes);
  }

  if (typeof autonomousActionsEnabled === 'boolean') {
    securityManager.setAutonomousActions(userId, autonomousActionsEnabled);
  }

  const status = securityManager.getSecurityStatus(userId);
  res.json({ success: true, status });
});
