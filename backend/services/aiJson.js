const { getGenAI, hasKeys } = require('../utils/geminiKeyManager');

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
// Tried when the main model is overloaded or rate limited
const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.8-flash,gemini-3.5-flash-lite')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 25000);
const RETRY_DELAY_MS = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// "Busy" and "slow down" answers are worth another try; a bad request is not
function isTransient(err) {
  return /\b(429|500|503)\b|overloaded|high demand|timed out|fetch failed/i.test(String(err && err.message));
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`AI request timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function parseJson(text) {
  const cleaned = String(text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

/**
 * Ask Gemini for a JSON answer. The main model is tried first, then each backup
 * model once; every try uses the next API key in rotation.
 * Throws when no key is configured or every try fails, so callers can fall back.
 */
async function generateJson(prompt, { system, timeoutMs = TIMEOUT_MS, temperature = 0.6 } = {}) {
  if (!hasKeys()) throw new Error('No Gemini API key configured');

  // At most three tries, so a caller never waits much over a minute
  const attempts = [MODEL, ...FALLBACK_MODELS.filter((m) => m !== MODEL)].slice(0, 3);
  let lastError;

  for (let i = 0; i < attempts.length; i++) {
    try {
      const model = getGenAI().getGenerativeModel({
        model: attempts[i],
        generationConfig: { responseMimeType: 'application/json', temperature },
        ...(system ? { systemInstruction: system } : {}),
      });
      const result = await withTimeout(model.generateContent(prompt), timeoutMs);
      return parseJson(result.response.text());
    } catch (err) {
      lastError = err;
      if (i < attempts.length - 1 && isTransient(err)) await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

module.exports = { generateJson };
