# Mobile controls and layout verification — 2026-09-30

Both stages now select a compact touch layout for coarse pointers, narrow phones, and short landscape phones. The original desktop controls remain available on larger mouse-driven screens. Stage 3 stays a non-interactive Coming soon tile.

## Interaction

- Independent pointer ownership for the thumb pad and fire button. Releasing the aiming finger leaves the trigger held; releasing/cancelling the fire finger stops it.
- Stage 1's pad has a dead zone and progressive response for fine corrections, with its neutral point set where the finger lands. Naval range movement uses the existing inverse-distance aim model and respects optic sensitivity.
- Stage 2 uses relative screen-space swipes: 0.8 sight pixels per finger pixel, no continued drift while held, and lift/reposition to continue. Battlefield dragging uses the same mapping. The reticle stays independent of assisted target centers, and stops at reachable beach limits without dead travel when reversing.
- Dragging the battlefield adjusts aim without firing. Touching down does not jump the sight to the finger.
- Pause, leaving the app, rotation and stage changes clear held input. Touch controls unmount outside active play.
- Naval target cycling and optic remain accessible. Beach grenades and earned air support retain their on-screen actions.

## Layout and rendering

- Dynamic viewport height, safe-area insets, 44 px minimum action buttons, 76–104 px thumb controls, compact own-ship/bunker instruments.
- Short landscape views use a 44 px header, transparent space between the thumb controls, bottom-aligned naval target details, and beach tactical buttons beside the thumb controls. No wide tracking strip crosses the ships.
- Mission selection, briefings, results and supplies can scroll. Landscape briefing places the start action beside the instructions.
- Portrait beach camera moves to the firing opening and looks down the beach, reducing ceiling obstruction.
- Touch rendering caps pixel ratio at 1.25 and uses 1024 px sun shadows. Desktop retains 1.75 / 2048. No frame-rate guarantee or measured real-device improvement is claimed.

## Initial mobile release evidence

- 75 automated tests passed, including four new input/render-budget regressions: fine aim and diagonal bounds, pointer ownership and cancellation, naval frame-rate-independent aiming, and pixel-density caps.
- Type checking, lint and production build passed. The final publishing workflow also runs these gates on the merge commit.
- Chrome touch emulation: held two fingers in each stage, released aim independently, observed continued firing and stationary aim, then cancelled/released fire. Stage 2 heat rose while firing; touch-drag changed the sight without raising heat. Rifle grenade use reduced inventory from 3 to 2.
- Browser sizes checked: 320×568, 390×844, 667×375, 844×390, 768×1024 and 1024×768. Small-phone combat actions remained inside the viewport, at least 44 px tall, with no horizontal document overflow. A short phone menu correctly scrolls to the remaining cards.
- Pause/resume, retry after defeat, mission return, naval target cycling and optic were exercised. Desktop at 1280×720 restored the normal controls and successfully fired a salvo.
- No browser console errors observed. Temporary touch emulation and viewport overrides were removed after testing.

## Sightline and aiming follow-up — 2026-09-30

A supplied iPhone screenshot exposed obstructed sea targets despite the original layout checks. Reproduced at 873×348: the old tracking strip and full-width dark controls panel occupied the lower battle view. The tracking button now sits inside compact bottom readouts; the surrounding scene remains visible.

- Chrome touch emulation checked 873×348, 667×300, 390×844 and 320×568. Combat controls remained in bounds without horizontal page overflow. At 667×300, the beach aim/fire pads are 76×76 and the separate grenade/support actions are 44 px tall, with no overlap.
- Stage 2: a 30 px horizontal / −10 px vertical swipe moved the sight exactly 24 / −8 screen pixels. Holding still caused no drift; releasing aim left the second fire finger active (heat rose to 65%). The far-edge reticle stayed bounded, then a 10 px reverse swipe immediately moved it back 8 px. Cancellation and pause cleared held input.
- Desktop at 1280×720: standard controls restored, naval firing entered reload, and beach mouse aim followed 630×320 while held fire raised barrel temperature. No browser console errors observed. Temporary touch and viewport overrides were removed.
- Three new pointer regressions cover depth-independent swipes, event coalescing, and immediate reversal at the reachable edge. Existing mouse/craft aim behavior remains covered.
- Final verification: all 78 tests passed, plus type checking, scoped lint, whitespace checks and the production build with the `/BeachHead` base path.

These checks use desktop browser emulation; physical iOS/Android devices, device thermal limits, and real notch geometry have not been measured in this pass.
