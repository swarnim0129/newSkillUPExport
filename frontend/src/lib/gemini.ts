import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";

/**
 * Round-robin Gemini API key manager for Next.js server-side routes.
 *
 * Reads keys from environment variables:
 *   GEMINI_API_KEY_1, GEMINI_API_KEY_2, ..., GEMINI_API_KEY_N
 * Falls back to GEMINI_API_KEY if no numbered keys are found.
 */

const keys: string[] = [];

// Collect numbered keys
for (let i = 1; i <= 20; i++) {
  const key = process.env[`GEMINI_API_KEY_${i}`];
  if (key) keys.push(key);
}

// Fallback to single key
if (keys.length === 0 && process.env.GEMINI_API_KEY) {
  keys.push(process.env.GEMINI_API_KEY);
}

let currentIndex = 0;

/**
 * Returns a GoogleGenerativeAI instance initialised with the next key
 * in round-robin order. Call this per-request, not at module top-level.
 */
export function getGeminiClient(): GoogleGenerativeAI {
  if (keys.length === 0) {
    throw new Error("No Gemini API keys configured");
  }
  const key = keys[currentIndex % keys.length];
  currentIndex++;
  return new GoogleGenerativeAI(key);
}

// Main model first, then backups. Gemini often answers "high demand" (503);
// a second model usually answers straight away.
const MODELS = [
  process.env.GEMINI_MODEL || "gemini-3.5-flash",
  ...(process.env.GEMINI_FALLBACK_MODELS || "gemini-3.8-flash,gemini-3.5-flash-lite")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean),
];

function isTransient(err: unknown): boolean {
  return /\b(429|500|503)\b|overloaded|high demand|fetch failed|timed out/i.test(String((err as Error)?.message || err));
}

/**
 * Run a Gemini call, trying the next model (and next API key) when one fails.
 * At most three tries; the last error is thrown if all fail.
 */
export async function withGeminiFallback<T>(run: (model: GenerativeModel) => Promise<T>): Promise<T> {
  const attempts = [...new Set(MODELS)].slice(0, 3);
  let lastError: unknown;
  for (let i = 0; i < attempts.length; i++) {
    try {
      return await run(getGeminiClient().getGenerativeModel({ model: attempts[i] }));
    } catch (err) {
      lastError = err;
      if (i < attempts.length - 1 && isTransient(err)) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
  throw lastError;
}
