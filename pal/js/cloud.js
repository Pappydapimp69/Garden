// Optional cloud brain. Talks only to the pal-chat edge function, which
// pins the model and clamps tokens server side. The client sends text and
// a small garden summary, nothing else.

export function makeCloud(settings) {
  if (!settings.cloudUrl) return null;
  return async (text, { state }) => {
    const garden = state.plants.slice(0, 40).map((p) => `${p.label} in ${p.bed}, planted ${p.planted}`);
    const history = state.chat.slice(-8).map((m) => ({ role: m.role === 'me' ? 'user' : 'assistant', text: m.text }));
    const r = await fetch(settings.cloudUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(settings.cloudToken ? { Authorization: `Bearer ${settings.cloudToken}` } : {}) },
      body: JSON.stringify({ text, history, garden, palName: settings.palName }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.text || null;
  };
}
