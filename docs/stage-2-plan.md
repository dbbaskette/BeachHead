# Stage 2 — Hold the beach

Approved direction: a pillbox defense stage inspired by the infantry machine-gun encounter the user remembers. Continue the campaign after naval victory; also offer clearly labeled Stage 2 practice from the briefing so the new encounter is immediately reviewable.

The player mans a detailed gun inside a concrete bunker above a beach. Three waves arrive from landing craft and advance between cover rows. Mouse/touch aiming selects a world point; holding fire produces automatic bursts, heat builds, and an overheat lockout encourages controlled bursts. Breaches damage bunker integrity. Defeating all waves wins the campaign; defeat can retry Stage 2 without replaying the sea battle.

Implementation tasks:
1. Pure deterministic infantry simulation and meaningful tests (separate agent). Contract: types.ts, createPillboxBattle(), aimPillbox(b,x,z), stepPillbox(b,dt,firing) -> events. Ready/paused/terminal states freeze. No DOM.
2. Detailed Three.js pillbox/beach/infantry renderer (separate agent). Contract: PillboxScene(host), render(b,dt,reducedMotion), event(e), aim(clientX,clientY)->{x,z}|null, project(x,z)->{x,y,visible}, dispose(). Camera and scene own all GPU lifecycle. No gameplay mutation.
3. Parent integrates campaign stage transition, accessible controls/HUD, distinct automatic-gun audio, pause/retry/practice and error handling.
4. Run full tests/types/authored lint/build, browser playtest stage selection, aiming/firing/heat/pause/retry, and independent review. Existing hosted version remains unchanged until publishing is requested.

Coordination: tasks 1 and 2 consume the same types.ts; task 3 consumes both APIs. Agent file ownership is separate. Existing naval stage and graphics/audio work must be preserved. Work continues on existing improvement branch so the running local preview includes both passes.
