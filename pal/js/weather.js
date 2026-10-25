// Open-Meteo forecast: free, no key. Returns a small summary or null.
// Cached for an hour so the pal does not refetch on every question.

let cache = null;

export async function getWeather(lat, lon, fetchFn = globalThis.fetch) {
  if (lat == null || lon == null || !fetchFn) return null;
  if (cache && cache.key === `${lat},${lon}` && Date.now() - cache.at < 3600e3) return cache.data;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max' +
    '&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto&forecast_days=3';
  try {
    const r = await fetchFn(url);
    if (!r.ok) return null;
    const j = await r.json();
    const d = j.daily;
    const data = {
      high: Math.round(d.temperature_2m_max[0]), low: Math.round(d.temperature_2m_min[0]),
      rainToday: d.precipitation_sum[0], rainTomorrow: d.precipitation_sum[1],
      rainChance: d.precipitation_probability_max[0],
      minNext3: Math.round(Math.min(...d.temperature_2m_min)),
      maxNext3: Math.round(Math.max(...d.temperature_2m_max)),
    };
    cache = { key: `${lat},${lon}`, at: Date.now(), data };
    return data;
  } catch { return null; }
}

export function summarize(w) {
  if (!w) return null;
  const parts = [`High of ${w.high}, low of ${w.low}.`];
  if (w.rainToday >= 0.1) parts.push(`About ${round1(w.rainToday)} inches of rain today.`);
  else if (w.rainTomorrow >= 0.1) parts.push(`Rain likely tomorrow, about ${round1(w.rainTomorrow)} inches.`);
  if (w.minNext3 <= 34) parts.push(`Frost risk. It may drop to ${w.minNext3}. Cover tender plants.`);
  if (w.maxNext3 >= 95) parts.push(`Hot stretch ahead, up to ${w.maxNext3}. Water early in the morning.`);
  return parts.join(' ');
}

const round1 = (n) => Math.round(n * 10) / 10;

// Daily highs and lows from `from` through a week of forecast, for growth
// tracking. Archive data lags about five days, so the recent week and the
// forecast come from the forecast endpoint. Returns { 'YYYY-MM-DD': [hi, lo] }.
// Missing days are left missing; growth.js fills and reports them.
let tempCache = null;

export async function getTemps(lat, lon, from, fetchFn = globalThis.fetch) {
  if (lat == null || lon == null || !fetchFn || !from) return {};
  const key = `${lat},${lon},${from}`;
  if (tempCache && tempCache.key === key && Date.now() - tempCache.at < 3 * 3600e3) return tempCache.data;
  const out = {};
  const put = (j) => {
    const d = j?.daily; if (!d) return;
    d.time.forEach((t, i) => {
      const hi = d.temperature_2m_max[i], lo = d.temperature_2m_min[i];
      if (hi != null && lo != null) out[t] = [hi, lo];
    });
  };
  const q = `latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto`;
  const end = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const start = from < end ? from : null;
  const jobs = [fetchFn(`https://api.open-meteo.com/v1/forecast?${q}&past_days=7&forecast_days=7`)];
  if (start) jobs.push(fetchFn(`https://archive-api.open-meteo.com/v1/archive?${q}&start_date=${start}&end_date=${end}`));
  const res = await Promise.allSettled(jobs);
  for (const r of res) {
    if (r.status !== 'fulfilled' || !r.value.ok) continue;
    try { put(await r.value.json()); } catch {}
  }
  if (Object.keys(out).length) tempCache = { key, at: Date.now(), data: out };
  return out;
}
