# Naval Combat Implementation Plan

> For agentic workers: use the subagent-driven-development skill for independent combat work and review. The site owner retains all Sites setup, UI, preview, and publication responsibilities.

**Goal:** Deliver a complete focused 3D naval encounter in a desktop browser.

**Architecture:** Pure fixed-step simulation, imperative Three.js scene, React HUD. Procedural graphics and synthesized audio keep the first playable self-contained.

**Tech Stack:** Sites starter, React, TypeScript, Three.js, Vite, Node tests via tsx.

**Spec:** `docs/superpowers/specs/2026-09-09-naval-combat-design.md`

## Global constraints

- Desktop browser first, responsive layout, pixel ratio capped at 2.
- Three targets, complete win/loss/restart loop, no campaign in this increment.
- No strict TDD; implement coherent slices then test per user working agreements.
- Site owner alone controls project initialization, metadata, source pushes, and publishing.

## Task 1: Combat model

- [ ] Create `game/lib/naval/simulation.ts` and `game/lib/naval/simulation.test.ts`.
- [ ] Export typed simulation, aim/range setters, fire, step, and restart functions. Document exact interfaces in source before integration.
- [ ] Model deterministic three-ship encounter, shell arcs and collision, reload, incoming fire, score, and results.
- [ ] Verify ballistic range, reload, miss feedback, hits, loss, win, and clean restart with Node tests.

## Task 2: Complete 3D experience

- [ ] Scaffold Sites in `game/`, retain generated components and package manager.
- [ ] Create `game/lib/naval/scene.ts` for ocean, sky, islands, ships, forward deck, projectiles, impact effects, and render cleanup.
- [ ] Create `game/lib/naval/audio.ts` for user-initiated gunfire, splashes, and hit sounds.
- [ ] Create client game component and stylesheet, compose from `game/app/page.tsx`; update title and metadata.
- [ ] Wire the combat module and controls, briefing, HUD, target selection, pause, results, sound, and motion preferences.
- [ ] Start and retain development server; open the first coherent compiled preview once.

## Task 3: Verify and deliver

- [ ] Review combat and integration for functional gaps; fix material findings.
- [ ] Run full relevant tests, typecheck, and production build.
- [ ] Save run instructions and known scope in README.
- [ ] Save exact source state and privately publish through Sites; verify terminal deployment status.

## Execution notes

The approved direction is sufficient authorization to implement; no repeated design approval requested. The empty workspace is dedicated to this project, so no separate worktree is needed before a repository exists. Browser testing remains outside current authorization under the Sites skill; automated simulation and compilation validation are required.
