# Bunker equipment art pass

The in-game props and `/equipment-preview` share the builders in
`lib/bunker/equipment.ts`. The viewer offers orbit, zoom, and reset controls.

- Timber crates use separate boards, recessed joints, catches, nail heads, and hanging handles.
- Radio sets have rounded enclosures, recessed analogue meters, Bakelite knobs,
  protective carrying handles, ventilation slots, and feet.
- Beds use tubular steel frames, padded mattresses and pillows, and shaped blankets.
- Oil drums have lathed reinforcing beads, rolled rims, and filling plugs.
- The gun has a tapered barrel, cast pedestal, and curved carriage cheeks;
  the generator uses cylindrical housings, rounded rocker covers, and fuel/manifold pipes.

Prop geometry is merged by material within each object. Radios and racks use six
material batches; crates and bunks use four. Existing gameplay collision volumes,
mission interactions, and guard animations remain unchanged. This is a geometry
and material pass, not a claim of scanned assets or full physical simulation.

## Timber material

`public/textures/bunker-timber.jpg` was generated with the built-in image-generation
tool on October 2, 2026, then converted to JPEG for game delivery. It replaces the
steel deck texture previously used for bunker wood. Color and bump share the image;
this is not a measured PBR scan. Its grain is oriented along the crate battens and
offset across individual boards.

Prompt:

> Use case: photorealistic-natural. Asset type: seamless tiling game material,
> albedo/base-color texture. Create a square 1024x1024 orthographic macro scan of
> aged unfinished pale brown pine timber for WWII ammunition crates. Continuous
> horizontal fine wood grain across the image, subtle fibres and small pores,
> occasional fine hairline splits and tiny knots, dry dusty wear, muted medium tan
> with gray weathering, evenly lit with absolutely no directional shadows or
> highlights. Edge-to-edge wood only. No boards or plank seams, no nails, no
> hardware, no text, no frame, no perspective. Opposite edges should tile
> seamlessly. Preserve subtle high-frequency photographic detail rather than
> painterly strokes.
