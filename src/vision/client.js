import {
  VISION_PROXY_ENDPOINT, VISION_MODEL, VISION_MAX_TOKENS,
  SUPABASE_ANON_KEY, LOCAL_API_KEY_STORAGE,
} from '../config.js';
import { getSession } from '../auth/authManager.js';

// Thrown when the Supabase edge function reports the master-key quota is
// exhausted. The UI catches this to prompt the user for their own API key.
export class QuotaError extends Error {
  constructor(info) {
    super('Free vision quota exceeded');
    this.name = 'QuotaError';
    this.code = 'quota_exceeded';
    this.info = info || {};
  }
}

function getUserApiKey() {
  try { return localStorage.getItem(LOCAL_API_KEY_STORAGE) || ''; }
  catch (e) { return ''; }
}

async function callProxy(messages) {
  const s = getSession();
  if (!s || !s.access_token) throw new Error('Not signed in');

  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + s.access_token,
  };
  const userKey = getUserApiKey();
  if (userKey) headers['x-user-api-key'] = userKey;

  const resp = await fetch(VISION_PROXY_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: VISION_MODEL,
      max_tokens: VISION_MAX_TOKENS,
      messages,
    }),
  });

  if (resp.status === 402) {
    let info = {};
    try { info = await resp.json(); } catch (e) {}
    throw new QuotaError(info);
  }
  if (!resp.ok) {
    let msg = 'Vision API ' + resp.status;
    try {
      const err = await resp.json();
      msg = err.error?.message || err.message || err.error || msg;
    } catch (e) {}
    throw new Error(msg);
  }
  return resp.json();
}

export async function visionRequest(messages) {
  const data = await callProxy(messages);
  const text = data.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .replace(/```json|```/g, '')
    .trim();
  return JSON.parse(text);
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
