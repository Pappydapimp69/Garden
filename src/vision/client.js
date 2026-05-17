// Single seam for the Anthropic Messages API. Two paths:
//
//   1. BYOK — the user has stored their own key (apiKey.js). We call
//      api.anthropic.com directly from the browser with their key.
//   2. Covered — we call the vision-proxy edge function with the user's
//      Supabase JWT. The edge function enforces the per-user quota
//      (10/day UTC, 100/lifetime) and forwards using our server-side key.

import { VISION_MODEL, VISION_ENDPOINT, VISION_MAX_TOKENS, VISION_PROXY_URL, SUPABASE_ANON_KEY } from '../config.js';
import { getSession } from '../auth/authManager.js';
import { hasApiKey, getApiKey } from '../auth/apiKey.js';
import { events, EV } from '../state/session.js';
import { promptApiPassword } from '../ui/apiPasswordPrompt.js';
import { logAction } from '../data/actionsLog.js';

// `export class` isn't picked up by build.mjs's EXPORT_DECL_RE; the const-assigned
// class expression is functionally equivalent and goes through the rewriter.
export const QuotaExhaustedError = class QuotaExhaustedError extends Error {
  constructor(detail) {
    super('Vision quota exhausted');
    this.name = 'QuotaExhaustedError';
    this.detail = detail || {};
  }
};

function payload(messages) {
  return JSON.stringify({
    model: VISION_MODEL,
    max_tokens: VISION_MAX_TOKENS,
    messages,
  });
}

function parseAnthropic(data) {
  const text = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .replace(/```json|```/g, '')
    .trim();
  return JSON.parse(text);
}

async function _callBYOK(messages) {
  const apiKey = await getApiKey({ promptForPassword: promptApiPassword });
  const resp = await fetch(VISION_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: payload(messages),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error('Vision API ' + resp.status + (txt ? ': ' + txt.slice(0, 200) : ''));
  }
  return parseAnthropic(await resp.json());
}

async function _callProxy(messages) {
  const s = getSession();
  if (!s) throw new Error('Not signed in');
  const resp = await fetch(VISION_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + s.access_token,
      'apikey':        SUPABASE_ANON_KEY,
    },
    body: payload(messages),
  });

  if (resp.status === 429) {
    let detail = {};
    try { detail = await resp.json(); } catch {}
    logAction('vision_quota_exhausted', detail);
    throw new QuotaExhaustedError(detail);
  }
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error('Vision proxy ' + resp.status + (txt ? ': ' + txt.slice(0, 200) : ''));
  }

  logAction('vision_proxy_call', {});
  events.emit(EV.VISION_CALLED);
  return parseAnthropic(await resp.json());
}

export async function visionRequest(messages) {
  if (hasApiKey()) {
    const result = await _callBYOK(messages);
    logAction('vision_byok_call', {});
    return result;
  }
  return _callProxy(messages);
}

export function imageBlock(dataUrl) {
  return {
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: dataUrl.split(',')[1] },
  };
}

export function textBlock(text) {
  return { type: 'text', text };
}
