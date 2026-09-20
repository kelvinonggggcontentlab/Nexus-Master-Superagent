import crypto from 'crypto';

export type UserRole = 'owner' | 'operator' | 'auditor';

export interface NexusUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
}

export interface WebAuthnCredential {
  id: string; // Base64 credential ID
  publicKey: string; // Base64 public key
  counter: number;
  transports?: AuthenticatorTransport[];
  deviceLabel: string;
  credentialType: 'passkey' | 'security_key';
  createdAt: string;
  lastUsedAt: string;
}

export interface TrustedDevice {
  id: string;
  userId: string;
  label: string;
  platform: string;
  userAgent?: string;
  ipAddress?: string;
  isCurrentDevice: boolean;
  registeredAt: string;
  lastActiveAt: string;
  revoked: boolean;
}

export interface NexusSession {
  sessionId: string;
  userId: string;
  deviceId: string;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  idleTimeoutMs: number;
  requiresReauth: boolean;
  isEmergencyLocked: boolean;
}

export interface SecurityEvent {
  id: string;
  type:
    | 'login'
    | 'logout'
    | 'new_device'
    | 'session_creation'
    | 'session_revocation'
    | 'failed_authentication'
    | 'permission_denial'
    | 'high_risk_action'
    | 'confirmation'
    | 'tool_execution_failure'
    | 'token_refresh'
    | 'emergency_lock'
    | 'rate_limit_exceeded'
    | 'prompt_injection_blocked';
  userId?: string;
  sessionId?: string;
  details: Record<string, any>;
  ip?: string;
  timestamp: string;
}

export interface SecurityStatus {
  isLocked: boolean;
  authenticated: boolean;
  user?: Omit<NexusUser, 'secret'>;
  activeSessionCount: number;
  trustedDeviceCount: number;
  autoLockMinutes: number;
  autonomousActionsEnabled: boolean;
  highRiskConfirmationRequired: boolean;
}

class SecurityManager {
  private users: Map<string, NexusUser> = new Map();
  private credentials: Map<string, WebAuthnCredential[]> = new Map(); // userId -> credentials
  private devices: Map<string, TrustedDevice[]> = new Map(); // userId -> devices
  private sessions: Map<string, NexusSession> = new Map(); // sessionId -> session
  private auditEvents: SecurityEvent[] = [];
  private authChallenges: Map<string, { challenge: string; userId?: string; createdAt: number }> = new Map();
  private emergencyLockedUsers: Set<string> = new Set();
  private autonomousActionsDisabledUsers: Set<string> = new Set();
  private autoLockMinutesByUser: Map<string, number> = new Map(); // default 15 mins

  // Rate Limiting Buckets
  private rateLimitBuckets: Map<string, { count: number; resetAt: number }> = new Map();

  constructor() {
    this.seedDefaultSecurityState();
  }

  private seedDefaultSecurityState() {
    // Default system user
    const defaultUser: NexusUser = {
      id: 'usr_blacktower_root',
      email: 'kelvinong.gggcontentlab@gmail.com',
      displayName: 'Kelvin Ong (BLACKTOWER™)',
      role: 'owner',
      createdAt: new Date().toISOString(),
    };
    this.users.set(defaultUser.id, defaultUser);
    this.autoLockMinutesByUser.set(defaultUser.id, 15);

    // Register a pre-seeded hardware passkey credential for seamless demo & testing
    const defaultDevice: TrustedDevice = {
      id: 'dev_blacktower_primary',
      userId: defaultUser.id,
      label: 'Apple Silicon Enclave (MacBook Pro / Passkey)',
      platform: 'macOS (Touch ID / Face ID)',
      isCurrentDevice: true,
      registeredAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      revoked: false,
    };
    this.devices.set(defaultUser.id, [defaultDevice]);

    this.credentials.set(defaultUser.id, [
      {
        id: 'cred_passkey_enclave_01',
        publicKey: Buffer.from('mock_fido2_secp256r1_key').toString('base64'),
        counter: 1,
        deviceLabel: 'MacBook Touch ID / Passkey',
        credentialType: 'passkey',
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      },
    ]);

    this.logAuditEvent({
      type: 'session_creation',
      userId: defaultUser.id,
      details: { message: 'Security Gateway initialized with WebAuthn / Passkey support' },
    });
  }

  public getDefaultUser(): NexusUser {
    return this.users.get('usr_blacktower_root')!;
  }

  public getUser(userId: string): NexusUser | undefined {
    return this.users.get(userId);
  }

  // WebAuthn Challenge Generation
  public generateAuthChallenge(userId?: string): { challenge: string; challengeId: string } {
    const challengeId = `ch_${crypto.randomBytes(16).toString('hex')}`;
    const challenge = crypto.randomBytes(32).toString('base64url');
    this.authChallenges.set(challengeId, {
      challenge,
      userId,
      createdAt: Date.now(),
    });

    // Cleanup challenges older than 5 minutes
    setTimeout(() => this.authChallenges.delete(challengeId), 5 * 60 * 1000);

    return { challenge, challengeId };
  }

  public verifyChallenge(challengeId: string): boolean {
    const record = this.authChallenges.get(challengeId);
    if (!record) return false;
    this.authChallenges.delete(challengeId);
    return Date.now() - record.createdAt < 5 * 60 * 1000;
  }

  // Create Session
  public createSession(
    userId: string,
    deviceId?: string,
    ipAddress?: string,
    userAgent?: string
  ): { session: NexusSession; token: string } {
    const user = this.users.get(userId);
    if (!user) throw new Error('User does not exist');

    // Generate cryptographically secure session ID
    const sessionId = `nexus_sess_${crypto.randomBytes(32).toString('hex')}`;
    const autoLockMins = this.autoLockMinutesByUser.get(userId) || 15;
    const idleTimeoutMs = autoLockMins * 60 * 1000;
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24h absolute

    const resolvedDeviceId = deviceId || `dev_${crypto.randomBytes(8).toString('hex')}`;

    // Register device if new
    let userDevs = this.devices.get(userId) || [];
    const existingDev = userDevs.find(d => d.id === resolvedDeviceId);
    if (!existingDev) {
      const newDev: TrustedDevice = {
        id: resolvedDeviceId,
        userId,
        label: userAgent ? this.parseDeviceLabel(userAgent) : 'Trusted Workspace Device',
        platform: userAgent || 'Web / Secure Enclave',
        ipAddress,
        isCurrentDevice: true,
        registeredAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        revoked: false,
      };
      userDevs.push(newDev);
      this.devices.set(userId, userDevs);

      this.logAuditEvent({
        type: 'new_device',
        userId,
        details: { deviceId: resolvedDeviceId, label: newDev.label },
        ip: ipAddress,
      });
    } else {
      existingDev.lastActiveAt = new Date().toISOString();
    }

    const session: NexusSession = {
      sessionId,
      userId,
      deviceId: resolvedDeviceId,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      expiresAt,
      idleTimeoutMs,
      requiresReauth: false,
      isEmergencyLocked: this.emergencyLockedUsers.has(userId),
    };

    this.sessions.set(sessionId, session);

    this.logAuditEvent({
      type: 'login',
      userId,
      sessionId,
      details: { deviceId: resolvedDeviceId, message: 'Authenticated via WebAuthn Passkey' },
      ip: ipAddress,
    });

    return { session, token: sessionId };
  }

  private parseDeviceLabel(ua: string): string {
    if (ua.includes('Macintosh')) return 'macOS Workstation (Biometric Enclave)';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS Mobile Device (Touch ID / Face ID)';
    if (ua.includes('Windows')) return 'Windows Security Key / Hello';
    if (ua.includes('Android')) return 'Android Mobile Passkey';
    if (ua.includes('Linux')) return 'Linux FIDO2 Hardware Token';
    return 'Authorized Secure Device';
  }

  // Validate Session
  public validateSession(sessionId: string): { valid: boolean; session?: NexusSession; reason?: string } {
    if (!sessionId) {
      return { valid: false, reason: 'missing_session' };
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return { valid: false, reason: 'session_not_found' };
    }

    // Check emergency lock
    if (session.isEmergencyLocked || this.emergencyLockedUsers.has(session.userId)) {
      return { valid: false, session, reason: 'emergency_locked' };
    }

    // Check absolute expiration
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      this.logAuditEvent({
        type: 'session_revocation',
        userId: session.userId,
        sessionId,
        details: { reason: 'absolute_expiry' },
      });
      return { valid: false, reason: 'expired' };
    }

    // Check idle timeout
    if (Date.now() - session.lastActivityAt > session.idleTimeoutMs) {
      this.sessions.delete(sessionId);
      this.logAuditEvent({
        type: 'session_revocation',
        userId: session.userId,
        sessionId,
        details: { reason: 'idle_timeout' },
      });
      return { valid: false, reason: 'idle_timeout' };
    }

    // Refresh last activity
    session.lastActivityAt = Date.now();
    return { valid: true, session };
  }

  // Terminate / Revoke Session
  public revokeSession(sessionId: string, reason = 'user_logout'): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      this.logAuditEvent({
        type: 'logout',
        userId: session.userId,
        sessionId,
        details: { reason },
      });
      return true;
    }
    return false;
  }

  // Revoke all sessions for a user
  public revokeAllSessionsForUser(userId: string, reason = 'user_revoked_all'): number {
    let count = 0;
    for (const [id, sess] of this.sessions.entries()) {
      if (sess.userId === userId) {
        this.sessions.delete(id);
        count++;
      }
    }
    this.logAuditEvent({
      type: 'session_revocation',
      userId,
      details: { message: `Revoked ${count} active sessions`, reason },
    });
    return count;
  }

  // Emergency Lock
  public activateEmergencyLock(userId: string): void {
    this.emergencyLockedUsers.add(userId);
    // Revoke all active sessions immediately
    this.revokeAllSessionsForUser(userId, 'emergency_lock_activated');

    this.logAuditEvent({
      type: 'emergency_lock',
      userId,
      details: {
        message: 'EMERGENCY LOCK ACTIVATED: All sessions revoked, execution paused, tool calls blocked',
      },
    });
  }

  public releaseEmergencyLock(userId: string): void {
    this.emergencyLockedUsers.delete(userId);
    this.logAuditEvent({
      type: 'emergency_lock',
      userId,
      details: { message: 'Emergency lock released by authenticated operator' },
    });
  }

  public isEmergencyLocked(userId: string): boolean {
    return this.emergencyLockedUsers.has(userId);
  }

  // Autonomous actions switch
  public setAutonomousActions(userId: string, enabled: boolean): void {
    if (enabled) {
      this.autonomousActionsDisabledUsers.delete(userId);
    } else {
      this.autonomousActionsDisabledUsers.add(userId);
    }
    this.logAuditEvent({
      type: 'high_risk_action',
      userId,
      details: { autonomousActionsEnabled: enabled },
    });
  }

  public isAutonomousActionsEnabled(userId: string): boolean {
    return !this.autonomousActionsDisabledUsers.has(userId);
  }

  // Auto-lock configuration
  public setAutoLockMinutes(userId: string, minutes: number): void {
    const clamped = Math.max(1, Math.min(120, minutes));
    this.autoLockMinutesByUser.set(userId, clamped);
    // Update existing sessions for user
    for (const sess of this.sessions.values()) {
      if (sess.userId === userId) {
        sess.idleTimeoutMs = clamped * 60 * 1000;
      }
    }
  }

  public getAutoLockMinutes(userId: string): number {
    return this.autoLockMinutesByUser.get(userId) || 15;
  }

  // Devices & Credentials
  public getDevices(userId: string): TrustedDevice[] {
    return this.devices.get(userId) || [];
  }

  public revokeDevice(userId: string, deviceId: string): boolean {
    const userDevs = this.devices.get(userId) || [];
    const dev = userDevs.find(d => d.id === deviceId);
    if (dev) {
      dev.revoked = true;
      // Also terminate sessions belonging to this device
      for (const [sId, sess] of this.sessions.entries()) {
        if (sess.deviceId === deviceId) {
          this.sessions.delete(sId);
        }
      }
      this.logAuditEvent({
        type: 'session_revocation',
        userId,
        details: { revokedDeviceId: deviceId },
      });
      return true;
    }
    return false;
  }

  // Audit Logging
  public logAuditEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): void {
    const sanitizedDetails: Record<string, any> = {};
    for (const [k, v] of Object.entries(event.details || {})) {
      // Secret masking safeguard: never log passwords, tokens, API keys
      if (/token|password|secret|key|cookie/i.test(k)) {
        sanitizedDetails[k] = '[REDACTED_SECRET]';
      } else {
        sanitizedDetails[k] = v;
      }
    }

    const fullEvent: SecurityEvent = {
      id: `sec_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
      type: event.type,
      userId: event.userId,
      sessionId: event.sessionId,
      details: sanitizedDetails,
      ip: event.ip,
      timestamp: new Date().toISOString(),
    };

    this.auditEvents.unshift(fullEvent);
    if (this.auditEvents.length > 500) {
      this.auditEvents.pop();
    }
  }

  public getAuditEvents(userId?: string, limit = 100): SecurityEvent[] {
    if (userId) {
      return this.auditEvents.filter(e => !e.userId || e.userId === userId).slice(0, limit);
    }
    return this.auditEvents.slice(0, limit);
  }

  // Rate Limiting (Token Bucket)
  public checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetInMs: number } {
    const now = Date.now();
    let bucket = this.rateLimitBuckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 1, resetAt: now + windowMs };
      this.rateLimitBuckets.set(key, bucket);
      return { allowed: true, remaining: limit - 1, resetInMs: windowMs };
    }

    if (bucket.count >= limit) {
      return { allowed: false, remaining: 0, resetInMs: Math.max(0, bucket.resetAt - now) };
    }

    bucket.count++;
    return { allowed: true, remaining: limit - bucket.count, resetInMs: Math.max(0, bucket.resetAt - now) };
  }

  public getSecurityStatus(userId: string): SecurityStatus {
    const user = this.users.get(userId);
    const activeSessions = Array.from(this.sessions.values()).filter(s => s.userId === userId);
    const devices = (this.devices.get(userId) || []).filter(d => !d.revoked);

    return {
      isLocked: this.emergencyLockedUsers.has(userId),
      authenticated: !!user,
      user,
      activeSessionCount: activeSessions.length,
      trustedDeviceCount: devices.length,
      autoLockMinutes: this.autoLockMinutesByUser.get(userId) || 15,
      autonomousActionsEnabled: this.isAutonomousActionsEnabled(userId),
      highRiskConfirmationRequired: true,
    };
  }

  public resetForTesting(): void {
    this.sessions.clear();
    this.authChallenges.clear();
    this.emergencyLockedUsers.clear();
    this.autonomousActionsDisabledUsers.clear();
    this.rateLimitBuckets.clear();
    this.seedDefaultSecurityState();
  }
}

export const securityManager = new SecurityManager();
