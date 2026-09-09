# Beach Head — Battle Stations

A focused 3D browser-game prototype inspired by the linked naval invasion stages of the 1983 Commodore 64 game. This first slice is one complete naval encounter, with original procedural 3D artwork and synthesized sound.

## Run

Use Node 22.13 or newer and npm.

```sh
npm ci
npm run dev -- --port 3077
```

Open the local URL printed by the server. WebGL 2 and hardware acceleration are required.

## Play

Select **Take command**. Sink all three warships before they destroy your ship. Adjust bearing and range, fire, then correct using the impact report. The center ship starts near the initial gun setting. You have unlimited shells, with a 2.2-second reload. Enemy ships take two or three hits.

- Drag on the sea to adjust bearing and range; a short click fires.
- A/D or left/right arrows: bearing.
- W/S or up/down arrows: range.
- Space: fire (hold for repeated volleys).
- Tab: cycle the tracked target; tracking reports range and bearing without aiming for you.
- Escape: pause/resume. Leaving the tab pauses the battle.
- Visible controls also support bearing, range, firing, target selection, mute, reduced camera motion, and fullscreen.
- W/A/S/D continue to work after button actions. Click the sea to return full keyboard gunnery; focused sliders and Space/Tab on buttons retain standard control behavior. Shift+Tab leaves the game surface.

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

This is the naval first playable, not the full six-stage remake. Distances, gun elevations, and flight times are compressed for arcade play. Anti-aircraft combat, fleet routing, tank landings, and the fortress remain subsequent milestones. Procedural graphics establish direction; they are not final production assets.

Automated simulation tests and compilation/build checks are provided. Browser visual QA and hands-on playtesting have not been performed in this task. Performance targets require measurement on the intended player hardware.

Optional WebMCP tools expose battle status, starting, aiming, and firing in supporting browsers. Registration could not be verified in a supported browser context during this task. Unsupported browsers retain the complete visible game.

Linting the authored game files (`npm exec oxlint -- app lib/naval`) passes. The unmodified generated component catalog has pre-existing accessibility and React-compiler lint failures under `npm run lint`.
