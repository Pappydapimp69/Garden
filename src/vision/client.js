import { VISION_ENDPOINT, VISION_MODEL, VISION_MAX_TOKENS } from '../config.js';
import { getApiKey } from '../state/apiKey.js';

// Single seam for the Anthropic Messages API. Two operating modes:
//
//   1. Inside the Claude.ai artifact preview — the host proxies our request,
//      so we omit auth headers entirely. This is the current default.
//   2. Outside the sandbox — the user has unlocked an encrypted API key (see
//      src/state/apiKey.js, BLUEPRINT.md §6). We attach x-api-key,
//      anthropic-version, and the direct-browser-access header.
//
// A future third mode (Supabase edge-function proxy) replaces VISION_ENDPOINT
// with /api/vision/* and drops the api-key header entirely.

export async function visionRequest(messages) {
  const headers = { 'Content-Type': 'application/json' };
  const key = getApiKey();
  if (key) {
    headers['x-api-key']         = key;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }

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
