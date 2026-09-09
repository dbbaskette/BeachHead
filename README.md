# Beach Head — Battle Stations

A two-stage 3D browser-game prototype inspired by Beach-Head and Beach-Head II. Break a naval blockade, then defend a captured pillbox against an infantry counterattack. Stage 2 uses textured skeletal soldiers, scanned sand and concrete surfaces, battlefield rubble and tracks, detailed gun hardware, and recorded weapon effects.

## Run

Use Node 22.13 or newer and npm.

```sh
npm ci
npm run dev -- --port 3077
```

Open the local URL printed by the server. WebGL 2 and hardware acceleration are required.

## Play

Select **Take command**. Sink all three warships before they destroy your ship. Adjust bearing and range, fire, then correct using the impact report. The center ship starts near the initial gun setting. You have unlimited shells, with a 2.2-second reload. Enemy ships take two or three hits.

- Move the mouse over the sea to adjust bearing and range. Hold the left button for repeated volleys; use the mouse wheel for fine range adjustment. Touch controls retain drag-to-aim and tap-to-fire.
- A/D or left/right arrows: bearing.
- W/S or up/down arrows: range.
- Space: fire (hold for repeated volleys).
- Tab: cycle the tracked target; tracking reports range and bearing without aiming for you.
- Escape: pause/resume. Leaving the tab pauses the battle.
- Z or the optic button: toggle the magnified gunnery view.
- Visible controls also support bearing, range, firing, target selection, mute, reduced camera motion, and fullscreen.
- W/A/S/D continue to work after button actions. Click the sea to return full keyboard gunnery; focused sliders and Space/Tab on buttons retain standard control behavior. Shift+Tab leaves the game surface.

After naval victory, select **Stage 2 — Hold the beach**. The opening briefing also offers **Stage 2 practice** for direct access.

In Stage 2, move the pointer to aim and hold the left mouse button or Space to fire. The mouse wheel adjusts range. Touch players can drag while firing or use the traverse/range sliders and hold-fire control. W/A/S/D and arrows also aim. Infantry stop behind protective cover before advancing; after the second cover row they converge on the bunker. Fire controlled bursts: overheating locks the gun until it cools. Five breaches lose the position. Hold through three waves to complete the campaign; retry resumes from the Stage 2 briefing flow without requiring another naval victory. Escape and the pause button pause/resume; leaving the window pauses automatically.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

The export is written to `dist/client/`. `.openai/hosting.json` identifies the private Sites deployment. The simulation is deterministic and independent of React or Three.js.

## Structure

- `lib/naval/simulation.ts`: combat state, ship motion, hit detection, shell timing, score and results.
- `lib/naval/scene.ts`: scene lifecycle, camera, effects, screen projection.
- `lib/naval/models.ts`, `ocean.ts`: original ship geometry, islands, ocean and sky shaders.
- `lib/naval/audio.ts`: user-initiated audio effects.
- `app/naval-game.tsx`: game loop, controls and HUD.

## Scope and validation limits

This is a two-stage prototype, not the full original multi-stage remake. Distances, gun elevations, and flight times are compressed for arcade play. Anti-aircraft combat, fleet routing, tank landings, and the fortress remain possible subsequent milestones. Procedural graphics establish direction; they are not final production assets.

Automated simulation/audio tests and compilation/build checks are provided. Browser playtesting covered the deck and optic views, firing, hit/miss feedback, sinking, pause and muted combat. Performance targets still require measurement on the intended player hardware; subjective audio quality requires listening on the player's speakers or headphones.

Optional WebMCP tools expose battle status, starting, aiming, and firing in supporting browsers. Status, aiming, firing and paused-fire rejection were verified in the in-app browser. Unsupported browsers retain the complete visible game.

Asset sources and licenses are documented in [visual-assets.md](docs/visual-assets.md) and [audio-assets.md](docs/audio-assets.md).

Stage 2 character provenance: [infantry-assets.md](docs/infantry-assets.md). Scanned surfaces and battlefield dressing: [pillbox-visual-assets.md](docs/pillbox-visual-assets.md). All assets are served locally with the game. Stage 2 waits for its character and surface assets before enabling the start button.

Stage 2 gunshot: **Light Machine Gun** by **KuraiWolf**, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), adapted for automatic fire. [Source and changes](docs/pillbox-audio-assets.md).

Linting the authored game files (`npm exec oxlint -- app lib/naval`) passes. The unmodified generated component catalog has pre-existing accessibility and React-compiler lint failures under `npm run lint`.

### Latest control and art pass

Stage 1 uses lower mouse sensitivity, with Shift or the right mouse button for fine aiming; the optic also slows aiming. Wheel adjustments are finer, and bearing buttons move in 0.2-degree increments. Water wakes, reflections, exhaust and splash effects are restrained to keep ships visible.

Stage 2 infantry now use a WWII-inspired field-grey uniform treatment, webbing and smaller helmets, with four different procedural death reactions. The proposed aircraft stage is documented in `docs/stage-3-air-assault-plan.md`; it is not yet implemented.

## Play online

[Play Beach Head](https://dbbaskette.github.io/BeachHead/)

[Source repository](https://github.com/dbbaskette/BeachHead)

GitHub Actions tests and publishes the game to GitHub Pages whenever `main` is pushed. To reproduce the Pages build locally, run `NEXT_PUBLIC_BASE_PATH=/BeachHead npm run build`. The static website is generated in `dist/client`. Normal `npm run dev` continues to work at the root URL.
