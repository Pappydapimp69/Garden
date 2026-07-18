# LOCAL PITFALLS — this project's private index
- `[browser][mobile][css]` env(safe-area-inset-*) is 0 without viewport-fit=cover on the viewport meta — safe-area padding is a silent no-op until it's enabled; then inset edge controls with calc(px + env()) so it degrades to px where no inset exists → projects/pappydapimp69__garden.md#E1
