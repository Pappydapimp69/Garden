# Garden Pal

A talking garden buddy. Lives in `pal/`, separate from the older Garden Journal
app at the repo root (left untouched).

Run it: `cd pal && python3 -m http.server` then open http://localhost:8000.
ES modules need http, not file://. Tests: `node pal/test/run.mjs`.

## What it does
- **Talk** – type or tap the mic. Pip answers in short spoken sentences (browser TTS).
- **Today** – watering due (weather and mulch aware), harvest checks, frost and heat
  alerts, your reminders, and what to sow this week from your frost dates.
- **Garden** – beds, plants, growth bars, seed or transplant, packet days, quick "watered" taps, journal.
- **Growth by heat** – progress counts the heat each plant really got (growing degree
  days from Open-Meteo history), not calendar days. Hot days count less for cool crops
  like broccoli, cold snaps slow everything, missing weather days are filled from the
  plant's own average and reported. Pip says "start checking", then tells you the ripe sign.
- **Math** – rain barrel, rain garden, mulch, drip line, compost mix.
- **Plants** – 28 plant library with companion claims graded by evidence.
- **Cloud brain** – sign in with a Garden Journal account and every message goes to
  Claude through `supabase/functions/pal-chat`, with your garden's computed facts,
  weather, journal, and what Pip remembers. Pip's offline answer rides along as a hint so
  Brain math stays the source of numbers. Claude can add plants, log, set reminders,
  and remember facts; the app checks each action first. Offline rules take over when
  the cloud is down. Model and token cap pinned server side, atomic daily quota
  (`supabase/pal_chat.sql`).

## Turn on the cloud brain
1. Run `supabase/pal_chat.sql` in the Supabase SQL editor.
2. `supabase secrets set ANTHROPIC_API_KEY=...`
3. `supabase functions deploy pal-chat --no-verify-jwt`
4. In Pip's Settings, sign in.

## Design rules (from Brain and ZaneGPT)
- Every reply is TTS ready: plain words, short sentences, no symbols.
- Diagnoses keep what you said apart from the guess, and say how to prove the guess wrong.
- Check water and soil pH before blaming leaf colour on nutrients.
- Companion planting claims carry a grade: tested, plausible, or folklore.
- First flush is a fixed amount per storm, not a percent. Barrels only catch more if emptied.
- Rain garden size (roof over six to eight) is a one inch storm rule. Open question in Brain.
- Mulch two to four inches, clear of stems. Depth rule is an open question in Brain.
- Tasks are offered, never assigned. You tick what you did.
- Voice animation follows the speech engine's real start and end events.
