<div align="center">
  <a href="https://dbbaskette.github.io/BeachHead/">
    <img src="docs/images/beach-head-banner.svg" width="100%" alt="Beach Head — Battle Stations. Two playable stages, with an air assault planned. Play in your browser." />
  </a>

  <p><strong>A coastal battle, from the gun deck to the pillbox—and soon, the cockpit.</strong></p>

  <a href="https://github.com/dbbaskette/BeachHead/actions/workflows/pages.yml"><img src="https://github.com/dbbaskette/BeachHead/actions/workflows/pages.yml/badge.svg?branch=main" alt="Live build and GitHub Pages deployment status" /></a>
  <a href="https://github.com/dbbaskette/BeachHead/issues?q=is%3Aissue+is%3Aopen+label%3Astage-3-task"><img src="https://img.shields.io/github/issues/dbbaskette/BeachHead/stage-3-task?label=Stage%203%20tasks%20open&amp;color=d0ad73&amp;style=flat-square" alt="Live count of open Stage 3 tasks" /></a>
  <a href="https://github.com/dbbaskette/BeachHead/issues?q=is%3Aissue+is%3Aclosed+label%3Astage-3-task"><img src="https://img.shields.io/github/issues-closed/dbbaskette/BeachHead/stage-3-task?label=Stage%203%20tasks%20done&amp;color=619d8c&amp;style=flat-square" alt="Live count of completed Stage 3 tasks" /></a>

  <p><a href="https://dbbaskette.github.io/BeachHead/"><strong>▶ PLAY NOW</strong></a> &nbsp; · &nbsp; <a href="https://github.com/dbbaskette/BeachHead/issues/3">Stage 3 roadmap</a> &nbsp; · &nbsp; <a href="#controls">Controls</a> &nbsp; · &nbsp; <a href="#run-locally">Run locally</a></p>
</div>

A 3D browser game inspired by **Beach-Head** and **Beach-Head II**. Break a naval blockade, then hold a captured pillbox against a landing force. Textured battlefields, physically consistent weapon origins, smoke, persistent wrecks and spatial weapon effects bring the classic idea into a modern browser.

**Two stages are playable today. Stage 3 is planned.** Choose **Play campaign** for both current missions in order, or jump straight into either stage from the main menu. No installation or account is required to play. WebGL 2 and hardware acceleration are required.

## The campaign

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="https://dbbaskette.github.io/BeachHead/"><img src="docs/images/stage-1-naval.png" width="100%" alt="Stage 1 gameplay through the gunnery optic: a warship, sea reflections and drifting wreckage without floating target labels." /></a>
      <h3>01 / Break the blockade</h3>
      <p><strong>PLAYABLE · NAVAL GUNNERY</strong></p>
      <p>Set bearing and range, lead moving warships, and correct your next salvo from the splashes. Both shells leave the actual barrels along their bore direction. Use the magnified optic for distant targets.</p>
    </td>
    <td width="50%" valign="top">
      <a href="https://dbbaskette.github.io/BeachHead/"><img src="docs/images/stage-2-beach.png" width="100%" alt="Stage 2 gameplay: a clear view from the pillbox across foxholes, infantry, a jeep and landing craft, without enemy labels or hit counters." /></a>
      <h3>02 / Hold the beach</h3>
      <p><strong>PLAYABLE · PILLBOX DEFENSE</strong></p>
      <p>Repel three waves. Infantry shelter in foxholes, crawl behind cover and use smoke. Stop jeeps and landing-craft gunners; manage gun heat, rifle grenades and earned air support.</p>
    </td>
  </tr>
</table>

Actual gameplay captures. Both stages keep floating enemy labels, health bars and hit reports out of the battlefield. Read damage from impacts, smoke and wreckage; weapon instruments stay at the edges.

## Next: 03 / Break the landing

**PLANNED · GUIDED FIGHTER-BOMBER MISSION**

Stage 3 has a **Coming soon** card on the main menu; the mission itself is not playable yet.

Take a fictional WWII-inspired aircraft over the same coastline. Forward flight is automatic; you control banking, altitude, strafing and bomb release. Six bombs must last three attack passes. Destroy flak early to make the final run safer. The field of view stays free of floating enemy names, armor bars and hit counts.

```mermaid
flowchart LR
    A["01 · ACROSS THE BAY<br/>Strafe landing craft<br/>Lead the first bomb drop"] --> B["02 · ALONG THE SHORE<br/>Hit vehicles and supplies<br/>Silence the flak"]
    B --> C["03 · BREAK THE LANDING<br/>Destroy the command transport<br/>Survive the exit"]
    style A fill:#173642,stroke:#83a9a8,color:#f2eddd
    style B fill:#35473b,stroke:#b8ae84,color:#f2eddd
    style C fill:#524635,stroke:#d6b47b,color:#f2eddd
```

The issue badges above update from GitHub; closing a `stage-3-task` issue updates the completed count after badge caching refreshes. The plan is tracked in [epic #3](https://github.com/dbbaskette/BeachHead/issues/3), with nine issues containing dependencies, acceptance criteria and verification responsibilities.

| Delivery milestone | Work |
| --- | --- |
| **One playable pass** | [Flight and controls #4](https://github.com/dbbaskette/BeachHead/issues/4), [guns and bombs #5](https://github.com/dbbaskette/BeachHead/issues/5), first [targets #6](https://github.com/dbbaskette/BeachHead/issues/6) |
| **Complete the mission** | [Target persistence #6](https://github.com/dbbaskette/BeachHead/issues/6), [flak #7](https://github.com/dbbaskette/BeachHead/issues/7), [three-pass mission #8](https://github.com/dbbaskette/BeachHead/issues/8) |
| **Bring it to life** | [Cockpit and coast #9](https://github.com/dbbaskette/BeachHead/issues/9), [effects and audio #10](https://github.com/dbbaskette/BeachHead/issues/10), [campaign and menu #11](https://github.com/dbbaskette/BeachHead/issues/11) |
| **Playtest and ship** | [Balance, performance and release #12](https://github.com/dbbaskette/BeachHead/issues/12) |

[Read the mission design](docs/stage-3-air-assault-plan.md) · [Implementation plan](docs/superpowers/plans/2026-09-30-stage-3-air-assault.md) · [Issue dependency index](docs/stage-3-issues.md)

## Controls

| Action | Stage 1 — Naval battle | Stage 2 — Beach defense |
| --- | --- | --- |
| Aim | Mouse; WASD / arrows | Mouse; WASD / arrows |
| Fire | Hold left mouse or Space | Hold left mouse or Space |
| Adjust range | Mouse wheel; W/S | Mouse wheel; W/S |
| Fine aiming | Shift / right mouse button | Small pointer movements |
| Special actions | Z: gunnery optic · Tab: tracked target | G: rifle grenade · V: earned strafing run |
| Pause | Escape / pause button | Escape / pause button |
| Leave the mission | Main menu button or pause menu | Pause menu → main menu |

Both stages have visible controls, mute and reduced camera motion. Leaving the tab pauses combat. Focused buttons and sliders retain normal keyboard behavior; Shift+Tab leaves the game surface.

**Phones and tablets:** the game automatically switches to a thumb pad on the left and a hold-to-fire button on the right. Move the pad gently for fine aim, or drag the battlefield to adjust without firing. Both thumbs work independently. In Stage 1, hold fire to shoot again after reloading and tap the optic for a closer view. In Stage 2, use short bursts and the grenade / air-support buttons above the controls. Pause opens the route back to the menu.

Portrait and landscape are supported; landscape offers the widest view. Menus scroll on small screens, controls respect screen notches, and rotating or leaving the app pauses combat. Mobile rendering uses a lower pixel-density cap and shadow resolution. Device performance and touch feel still depend on the browser and hardware.

<details>
<summary><strong>Field notes: naval gunnery</strong></summary>

- Sink all three warships before your ship is destroyed. You have unlimited shells and a 2.2-second reload. Impact fires follow the struck part of the hull; sinking ships list, flood and leave drifting wreckage.
- Lead a moving target, then watch where the splashes fall to correct bearing and range. Tracking reports a target's position without automatically aiming at it.
- The gun pose, muzzle flashes and shell launch share one firing solution. Flight timing and gun elevations are compressed for arcade play.
- Vertical mouse aiming compensates for perspective at longer ranges. The visible cursor updates every rendered frame.
- Standalone Stage 1 ends at mission selection; a campaign victory continues to Stage 2.

</details>

<details>
<summary><strong>Field notes: holding the beach</strong></summary>

- Fire controlled bursts. Overheating locks the gun until it cools; a better barrel can be chosen between waves.
- Soldiers occupy foxholes, peek and duck. Catch them exposed or use a rifle grenade to clear cover. Bullets pass through smoke; terrain and cover can protect soldiers.
- Stop reinforcement jeeps before they unload, silence craft gunners, and damage ramps to delay the landing. Watch for grenade throws and mortar or MG crews.
- G throws a rifle grenade toward your aim point, up to 115 m. V calls earned air support along the aimed line. Both actions also have buttons.
- After each wave, choose bunker repair, an improved barrel or extra grenades. Hold through three waves; retry starts Stage 2 again.
- Enemy labels, health bars, setup timers and hit reports are intentionally absent from the battlefield.

[Detailed combat rules and tuning](docs/stage-2-threats.md)

</details>

## Run locally

Use **Node 22.13+** and npm.

```sh
npm ci
npm run dev -- --port 3077
```

Open the local URL printed by the server. The game uses React, TypeScript, Three.js and Vinext/Vite. Combat simulation is separated from rendering and audio.

<details>
<summary><strong>Checks, deployment and project map</strong></summary>

```sh
npm test
npm run typecheck
npm exec oxlint -- app lib/naval lib/pillbox
NEXT_PUBLIC_BASE_PATH=/BeachHead npm run build
```

The Pages workflow runs these checks and publishes `dist/client/` after a push to `main`. Its live badge is at the top of this README. A normal development build uses the root URL. Asset paths use `lib/asset-url.ts` so the public game works under `/BeachHead/`.

| Area | Location |
| --- | --- |
| Campaign routing and game interfaces | `app/campaign.tsx`, `app/naval-game.tsx`, `app/pillbox-game.tsx` |
| Naval simulation, gun solution, scene, models and audio | `lib/naval/` |
| Infantry, cover, landing craft, terrain and beach combat | `lib/pillbox/` |
| Local textures, models and sound effects | `public/` |
| Designs, validation notes and asset provenance | `docs/` |
| Planned air-combat modules | `lib/air/` — not implemented yet |

Simulation tests cover combat, progression, pause/retry, trajectories and resource cleanup. Browser checks cover rendering and input. Frame rate, balance and subjective sound quality still need measurement on the intended player hardware. The generated component catalog has existing lint findings outside the authored game paths; the scoped check above is the release gate.

Optional WebMCP controls support game status and actions in compatible browsers. Ordinary play does not depend on them. `.openai/hosting.json` retains the separate Sites deployment configuration; the public play link above uses GitHub Pages.

</details>

## Credits and provenance

Inspired by the original **Beach-Head** games. This is an evolving two-stage prototype with a third-stage design, not a reproduction of every original mission or a full flight simulator.

- [Naval visuals and textures](docs/visual-assets.md) · [Naval audio](docs/audio-assets.md)
- [Infantry assets](docs/infantry-assets.md) · [Beach surfaces and detail](docs/pillbox-visual-assets.md)
- [Pillbox audio sources and adaptations](docs/pillbox-audio-assets.md), including **Light Machine Gun** by **KuraiWolf**, CC BY 4.0
- README banner: original SVG artwork. Screenshots: current game captures. Live issue badges: [Shields.io](https://shields.io/).

---

<p align="center"><a href="https://dbbaskette.github.io/BeachHead/"><strong>TAKE YOUR STATION → PLAY BEACH HEAD</strong></a></p>
