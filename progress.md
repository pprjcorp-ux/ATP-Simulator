Original prompt: /goal faca um jogo igual o geometric dash [$develop-web-game](<local-skill-path>)

## 2026-05-30

- Target project: root Vite/React app in `<repo-root>`.
- Implemented first pass of an original Geometry Dash-style canvas game named `Prisma Dash`.
- Required test hooks added in `src/App.tsx`: `window.render_game_to_text()` and `window.advanceTime(ms)`.
- Controls planned for verification: Start button, Space/ArrowUp/W/click jump, R restart, P pause, F fullscreen.
- First build exposed TypeScript nullability on canvas context and inferred fallback-control return types; fixed by narrowing `CanvasRenderingContext2D` after the guard and typing `GameControls`.
- Playwright first pass produced valid screenshots/state and no console errors. It also showed the scripted jump route crashing at 33%.
- A hold-jump test crashed by a few pixels on the first double spike, so spike hitboxes were made slightly more forgiving while keeping the visual spike size.
- A second hold-jump test passed that double spike but crashed because held jump triggered one frame after landing. Updated landing logic so held/queued jumps fire immediately on the landing frame.
- A third hold-jump test still hit a same-frame edge case while the cubo was already launching. Added a 55ms collision grace window on jump start and included it in `render_game_to_text`.
- Hold-jump Playwright run now reaches `mode: complete` with no console errors. Corrected progress math so completion maps to 100% based on the player's finish line, not raw camera distance.
- Final verification:
  - `npm run build` passed after final code and CSS changes.
  - `npm run lint` passed after final code and CSS changes.
  - `develop-web-game` Playwright client verified complete run at `output/web-game/complete-run` with `mode: complete`, `progressPercent: 100`, and no console errors.
  - `develop-web-game` Playwright client verified no-jump crash at `output/web-game/no-jump-crash` with `mode: crashed` and no console errors.
  - `develop-web-game` Playwright client verified Enter restart after crash at `output/web-game/restart-after-crash` with `mode: playing`, `attempts: 2`, and no console errors.
  - Additional Playwright browser check verified `P` pause/resume (`paused` -> `playing`) with no console errors. Headless fullscreen did not enter fullscreen, but pressing `F` produced no errors.
- Mobile screenshot initially showed the toolbar overlaying the canvas floor. Updated CSS so the toolbar sits below the canvas instead of covering gameplay.
- Final CSS check: `output/web-game/mobile-menu-fixed.png` shows the toolbar below the canvas with no overlap and no console errors.
- Final game check: `output/web-game/final-complete-run` still reaches `mode: complete`, `progressPercent: 100`, and no console errors after the CSS change.
- TODO for next agent: if the user wants richer Geometry Dash-like behavior, add sound-reactive beats or authored level sections; keep the current `render_game_to_text` and `advanceTime` contracts intact.
