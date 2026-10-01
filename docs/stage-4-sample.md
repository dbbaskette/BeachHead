# Stage 4 — first playable sample

Scope: gun emplacement → service tunnel → munitions room, four guards, a medical kit and a tunnel exit. A standalone menu option; the existing three-stage campaign is unchanged. Clear all guards and approach the illuminated door to finish. Retry resets combat, resources and effects.

The first-person controller has wall/cover collision, keyboard movement, pointer-lock mouse look with a drag fallback, and independent mobile movement and fire/aim gestures. Pause, focus loss and leaving the stage clear held input. Touch rendering uses a lower pixel ratio and omits dynamic shadows.

Guards acquire line of sight, approach, ready a shot and fire at the player's recorded position. Moving during their wind-up can evade the shot. World geometry blocks both sides' attacks. Hitscan fire uses bounded guard volumes, with greater head damage, a finite magazine, automatic empty-magazine reload and manual reload. Rendering uses procedural gun and room geometry, shared animated guard models, bounded impact particles and procedural falling poses. This is a prototype, not a finished or historically exact depiction.

Reuses the repository's [scanned concrete and surface assets](pillbox-visual-assets.md), [timber textures](visual-assets.md), [WWII soldier and bunker materials](stage-4-realism.md) with period equipment and procedural rifle poses, and [existing gunfire audio](pillbox-audio-assets.md). No new external runtime dependencies or downloads. Concept artwork and original generation prompt remain in [stage-4-concept.md](stage-4-concept.md).

Verification covers room connectivity, wall collision, occluded shots, nearest-target hits, reload conservation, guard telegraph/dodge behavior, medical kit consumption, pause, defeat, gated victory, and a complete simulation run through movement and gunfire. Browser verification covers rendered guards, aiming/firing, menus, pause and mobile layouts.
