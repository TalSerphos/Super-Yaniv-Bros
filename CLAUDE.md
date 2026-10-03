# Super Yaniv Bros. — agent guide

A 16-bit platformer SPA deployed to GitHub Pages at https://superyanivbros.com.
Spec: `docs/GAME_SPEC.md`. Staged roadmap: `docs/PLAN.md`. Read `docs/LEARNINGS.md` before starting work.

## Layout
- `index.html` + `src/title/`: DOM/CSS title screen (no game engine; paints before any JS).
- `src/game/` (Stage 2+): Phaser 3, lazy-loaded via dynamic `import()` from the title.
- `art/reference/`: concept art from Tal (ground truth for look and feel).
- `art/manifest/*.yaml`: every generated asset (prompt, refs, output spec). `art/prompts/style.md`: style canon.
- `art/masters/`: chosen high-res sources (committed). `art/raw/`: candidates (gitignored).
- `src/assets/`: web-ready images built from masters (Vite content-hashes them).
- `tests/unit` (Vitest), `tests/e2e` (Playwright), `tests/fidelity` (screenshot vs concept art).

## Commands
```
npm run dev | build | preview
npm run lint && npm test && npm run build && npm run e2e   # run all before pushing
npm run fidelity [-- --judge]                              # metrics, + OpenAI vision rubric
npm run assets:generate -- --ids <id,prefix*> --quality low|medium|high [--max-spend 5]
npm run assets:process -- select --id <id> --from art/raw/<id>/<dir>/<n>.png
npm run assets:process -- build [--ids <id>]
```
Local Playwright uses `/opt/pw-browsers/chromium`; CI installs browsers itself.

## Asset workflow
1. Add or edit an entry in `art/manifest/*.yaml`. Never inline style text: it comes from `art/prompts/style.md`.
2. Explore at `--quality low` (2–3 candidates), make a contact sheet (`montage`), pick one, then rerun the winner's entry at `high`.
3. `select` the winner, then `build`. Commit the master and `src/assets/*`. Never commit `art/raw`.
4. Need alpha? Use `chroma: '#ff00ff'` (gpt-image-2 on flat magenta, keyed in process.ts). `transparent: true` falls back to gpt-image-1.5, which is weaker at text and pixel art.
5. Check any lettering in generated art by eye: models misspell (e.g. "YANIIV").

## Rules
- Budgets (enforced by `tools/check-budget.mjs` and Lighthouse CI): initial load ≤ 350 KB, title JS ≤ 15 KB gz, any image ≤ 180 KB, mobile Lighthouse perf ≥ 0.9, LCP < 2.5 s.
- Every user-visible flow gets a Playwright test; pure logic gets a Vitest test.
- HUD/menu text is drawn in DOM or engine, never baked into AI art.
- Guardrails from the spec: original art only (no Nintendo IP), slapstick only, villain has no ethnic/national markers.
- Work on the designated feature branch; `main` deploys to production.
