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
