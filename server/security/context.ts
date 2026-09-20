import { AsyncLocalStorage } from 'async_hooks';

export interface RequestSecurityContext {
  userId: string;
  sessionId: string;
  deviceId?: string;
  bearerToken?: string;
  ipAddress?: string;
}

const contextStorage = new AsyncLocalStorage<RequestSecurityContext>();

export function runWithRequestContext<T>(context: RequestSecurityContext, fn: () => Promise<T>): Promise<T> {
  return contextStorage.run(context, fn);
}

export function getRequestContext(): RequestSecurityContext | undefined {
  return contextStorage.getStore();
}

export function getCurrentUserId(): string {
  const ctx = getRequestContext();
  return ctx?.userId || 'usr_blacktower_root';
}

export function getCurrentBearerToken(): string | undefined {
  const ctx = getRequestContext();
  return ctx?.bearerToken;
}
