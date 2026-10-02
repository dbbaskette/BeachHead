# Beneath the guns: Radio silence

Stage 5 is now a standalone mission, replacing the short tunnel sample. The existing sea–flak–air–beach campaign is unchanged.

## Layout and objective

Twelve named spaces: gun emplacement, service tunnel, munitions, switchboard, generator, cable tunnel, radio command, quartermaster stores, barracks, infirmary, return passage and records vault. The munitions–stores–barracks–infirmary–return passage–generator loop provides an alternative to the central route. Five sliding doors share collision with rendering, sight and projectile tests. Twelve guards retain the existing recognition, combat and physical fall systems.

Follow RADIO signs through the generator and cable tunnel. Plant one charge on each of the two labelled radio racks, then return to the illuminated EXIT / BEACH door in the original gun room. Escape starts the exterior cinematic; completion or skipping leads to victory. Eliminating every guard is optional. There is no hidden countdown: detonation happens after the player reaches safety.

- C toggles the MP40 and demolition satchel.
- E opens a nearby door or starts charge placement on a nearby radio rack. Fire also places a charge when equipped.
- Placement takes 1.8 seconds and is cancelled by moving away, changing weapon or throwing a grenade; pausing freezes progress.
- G throws a grenade. M or the map button pauses and shows the floor plan.
- Mobile exposes independent movement, look and fire pads, charge selection, and contextual placement/open-door buttons.
- The infirmary and records vault each provide one medical/ammunition supply pickup.

## Finale

Fourteen-second photographic composition viewed across the landing beach. The beach includes destroyed armor, damaged landing craft, shell craters, obstacles and distant fallen soldiers. An establishing shot leads into demolition, concrete debris, dust and drifting smoke, ending on the collapsed casemate. This is a plate-based cinematic with procedural animation, not a prerecorded live-action video or a freely navigable exterior level.

Assets: `public/cinematics/bunker-beach-before.jpg`, `bunker-beach-blast.jpg`, `bunker-beach-after.jpg`. All three use the same composition and are loaded through the GitHub Pages base-path helper. Pausing, hidden-tab suspension, skip and reduced camera motion are supported. Missing images cannot block mission completion. The underground WebGL renderer stops drawing during the finale.

### Image provenance

Created October 2, 2026 using the built-in image-generation tool and imagegen skill; exported as JPEG for delivery. The initial cliff-only exploration was discarded after the user requested a landing beach with wrecks and bodies.

Base prompt: photorealistic WWII Normandy beach viewed toward a concrete cliff gun emplacement, wide 16:9; substantial landing beach in front, destroyed Sherman tanks, damaged landing craft, shell craters, tank tracks, steel obstacles and fallen WWII troops; cloudy dawn, atmospheric smoke and realistic scale; intact bunker, no UI.

Blast edit: preserve the exact composition and beach; local internal demolition of the distant bunker, fractured roof, vented orange flame, complex charcoal smoke, pale concrete dust and ejected slabs. After edit: preserve framing and foreground, show collapsed roof, broken concrete, damaged barrel and a small residual fire.

Source generations: `exec-494e0940-420d-48ab-958c-cd1e008b058d.png` (beach), `exec-22750c94-a3fb-4c3a-948a-3c25472b46da.png` (blast), `exec-28e83da0-6aab-42d0-b937-d6be45a3830a.png` (aftermath), in the session's generated-images directory. No external photographs or video clips were copied.

## Verification

Simulation tests cover connected rooms and valid guard spawns, an end-to-end combat/plant/escape route through the east wing, charge proximity and supply limits, interrupted/paused placement, cinematic-only completion, and a fresh replay. Finale timing and reduced-motion behavior have deterministic tests. Existing grenade, door, AI and ragdoll tests remain part of the release suite. Browser inspection covers new rooms, held charge, map and cinematic rendering; responsive checks are viewport checks, not a physical iPhone test.
