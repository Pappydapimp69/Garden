import { VISION_ENDPOINT, VISION_MODEL, VISION_MAX_TOKENS } from '../config.js';

// Single seam for the Anthropic Messages API. Today the call goes direct from
// the browser with no auth header — that only works inside the Claude.ai
// artifact preview, which proxies the request. When wiring in real auth:
//
//   1. Add a `getApiKey()` strategy (encrypted in localStorage, decrypted with
//      a session password — see BLUEPRINT.md "Storage Strategy").
//   2. Inject the headers below.
//   3. Optionally proxy through a Supabase edge function so the key never
//      leaves the device unencrypted.

export async function visionRequest(messages) {
  const headers = { 'Content-Type': 'application/json' };
  // TODO: add auth when leaving the Claude.ai sandbox.
  // headers['x-api-key']         = await getApiKey();
  // headers['anthropic-version'] = '2023-06-01';
  // headers['anthropic-dangerous-direct-browser-access'] = 'true';

  const resp = await fetch(VISION_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: VISION_MODEL,
      max_tokens: VISION_MAX_TOKENS,
      messages,
    }),
  });
  if (!resp.ok) throw new Error('Vision API ' + resp.status);
  const data = await resp.json();
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
