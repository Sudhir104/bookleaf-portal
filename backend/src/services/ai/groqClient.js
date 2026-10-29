import { env } from '../../config/env.js';

const BASE_URL = 'https://api.groq.com/openai/v1';
const TIMEOUT_MS = 20000;
const MAX_RETRIES = 2;
const MAX_CONCURRENT = 2; // free tier is rate-limited: queue instead of bursting
const BREAKER_THRESHOLD = 3; // consecutive failures before we stop calling for a while
const BREAKER_COOLDOWN_MS = 60000;

export class AiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // NOT_CONFIGURED | RATE_LIMITED | TIMEOUT | UNAVAILABLE | BAD_RESPONSE | CIRCUIT_OPEN
  }
}

// In-memory counters: cost awareness + health, exposed at GET /api/admin/ai/status
export const stats = {
  calls: 0,
  failures: 0,
  promptTokens: 0,
  completionTokens: 0,
  consecutiveFailures: 0,
  breakerOpenUntil: 0,
};

export const isConfigured = () => Boolean(env.groqApiKey);
export const health = () => ({
  configured: isConfigured(),
  state: !isConfigured() ? 'disabled' : Date.now() < stats.breakerOpenUntil ? 'degraded' : 'online',
  calls: stats.calls,
  failures: stats.failures,
  promptTokens: stats.promptTokens,
  completionTokens: stats.completionTokens,
});

// --- tiny semaphore so bursts of tickets don't trip rate limits -------------
let running = 0;
const waiting = [];
const acquire = () =>
  running < MAX_CONCURRENT ? (running++, Promise.resolve()) : new Promise((r) => waiting.push(r));
const release = () => {
  const next = waiting.shift();
  if (next) next();
  else running--;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callOnce(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.groqApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      const err = new AiError('RATE_LIMITED', 'AI provider rate limit reached');
      err.retryAfterMs = Math.min(retryAfter * 1000, 5000);
      throw err;
    }
    if (res.status >= 500) throw new AiError('UNAVAILABLE', `AI provider error (${res.status})`);
    if (!res.ok) throw new AiError('BAD_RESPONSE', `AI provider rejected request (${res.status})`);
    return await res.json();
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err.name === 'AbortError') throw new AiError('TIMEOUT', 'AI request timed out');
    throw new AiError('UNAVAILABLE', 'Could not reach AI provider');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Chat completion with timeout, retry/backoff on 429/5xx, concurrency limit and circuit breaker.
 * Returns { text, usage }. Always throws AiError so callers can degrade gracefully.
 */
export async function chat({ model, messages, json = false, maxTokens = 400, temperature = 0.2 }) {
  if (!isConfigured()) throw new AiError('NOT_CONFIGURED', 'GROQ_API_KEY is not set');
  if (Date.now() < stats.breakerOpenUntil) throw new AiError('CIRCUIT_OPEN', 'AI temporarily paused after repeated failures');

  await acquire();
  try {
    let lastErr;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const data = await callOnce({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
                    ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
        });
        const text = data?.choices?.[0]?.message?.content;
        if (!text) throw new AiError('BAD_RESPONSE', 'Empty AI response');

        stats.calls++;
        stats.consecutiveFailures = 0;
        stats.promptTokens += data.usage?.prompt_tokens || 0;
        stats.completionTokens += data.usage?.completion_tokens || 0;
        return { text, usage: data.usage || {} };
      } catch (err) {
        lastErr = err;
        const retryable = ['RATE_LIMITED', 'UNAVAILABLE', 'TIMEOUT'].includes(err.code);
        if (!retryable || attempt === MAX_RETRIES) break;
        await sleep(err.retryAfterMs || 600 * 2 ** attempt);
      }
    }
    stats.failures++;
    stats.consecutiveFailures++;
    if (stats.consecutiveFailures >= BREAKER_THRESHOLD) {
      stats.breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
      stats.consecutiveFailures = 0;
    }
    throw lastErr;
  } finally {
    release();
  }
}
