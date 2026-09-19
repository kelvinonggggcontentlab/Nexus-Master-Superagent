import { GoogleGenAI } from '@google/genai';

let geminiClient: GoogleGenAI | null = null;
let quotaExhaustedUntil = 0;

export function getGemini(): GoogleGenAI | null {
  if (process.env.NODE_ENV === 'test') {
    return null;
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY' || key.startsWith('MY_')) {
    return null;
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: key });
  }
  return geminiClient;
}

export function isGeminiQuotaExhausted(): boolean {
  return Date.now() < quotaExhaustedUntil;
}

export function markQuotaExhausted(cooldownMs: number = 60000): void {
  quotaExhaustedUntil = Date.now() + cooldownMs;
  console.info(
    `[Nexus AI] Gemini rate-limit/quota encountered. Deterministic execution engine active for ${Math.round(
      cooldownMs / 1000
    )}s.`
  );
}

export function isQuotaOrRateLimitError(err: any): boolean {
  if (!err) return false;
  const str = typeof err === 'string' ? err : JSON.stringify(err);
  const msg = err?.message || '';
  const status = err?.status || '';
  const code = err?.error?.code || err?.code || 0;
  return (
    code === 429 ||
    status === 'RESOURCE_EXHAUSTED' ||
    str.includes('429') ||
    str.includes('RESOURCE_EXHAUSTED') ||
    str.includes('quota') ||
    str.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('429')
  );
}
