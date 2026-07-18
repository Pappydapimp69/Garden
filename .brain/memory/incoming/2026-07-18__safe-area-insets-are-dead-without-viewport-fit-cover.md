## FULL ENTRY

- ID: E? (steward assigns the real id on promotion)
- Date: 2026-07-18
- Project: pappydapimp69/garden
- Tags: [browser][mobile][css][ui]
- What: The review screen's edge-hugging controls (a fixed FAB, the fullscreen review header/footer) were fought by hand ("bigger ring, faster hold, suppress OS gestures") to stop the mobile OS gesture band / home-indicator from eating touches near the screen edge.
- Why built: Plant-tagging review UX drags markers over a photo and has bottom action buttons; on a phone those live exactly where the OS reserves edge-swipe and home-indicator space.
- Design: Fixed pixel margins (`.fab bottom:20px right:20px`, review-footer `padding-bottom:14px`) plus `touch-action:none` on the draggable markers/photo.
- Got right: `touch-action:none` on the markers/photo was already correct — the draggable surface should own the gesture (the inverse of a scroll row wanting `pan-y`).
- Where/why it failed: The real gap was never enabled: `env(safe-area-inset-*)` returns **0** unless the page viewport is `viewport-fit=cover`. The viewport meta had only `width=device-width, initial-scale=1, user-scalable=no` — so any safe-area padding would have been a silent no-op, and the controls stayed flush in the OS gesture band.
- Fix: Add `viewport-fit=cover` to the viewport meta, THEN inset every edge-hugging fixed/fullscreen control with `calc(<px> + env(safe-area-inset-<side>))` (FAB bottom/right, review-header top, review-footer bottom, care-panel sheet).
- Why this fix: `calc(px + env())` degrades to exactly the original `px` on any device without insets, so it is safe by construction — no regression on desktop or non-notched phones, real spacing only where the OS reserves it.
- Rule of thumb: `env(safe-area-inset-*)` is dead weight without `viewport-fit=cover` on the viewport meta — adding safe-area padding without enabling it is a silent no-op; enable it first, then inset edge-hugging controls with `calc(px + env())` so it degrades cleanly.
- Provenance (verified/assumed): Verified first-hand that the build compiles, the four `env()` uses + `viewport-fit=cover` propagate into `dist/garden.html`, and `calc(px + env())` reduces to the original px when insets are 0 (no desktop regression). Assumed (not device-tested here): the actual notch/home-indicator clearance on physical iOS/Android hardware — that follows from documented `env()`/`viewport-fit` behavior, not a device screenshot.
- Composed: the-game-the-recursion/E11, shadow/E3
- Link: garden@fc79ae1 (retrieval-before-building via `brain query`, read-only link)

## PROPOSED INDEX LINE

`[browser][mobile][css]` env(safe-area-inset-*) is 0 without viewport-fit=cover on the viewport meta — safe-area padding is a silent no-op until it's enabled; then inset edge controls with calc(px + env()) so it degrades to px where no inset exists → projects/pappydapimp69__garden.md#E?
