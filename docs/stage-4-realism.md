# Stage 4 artwork matching pass

Target: the existing [bunker concept](stage-4-concept.md), especially weathered concrete, worn gun machinery, warm practical lights, wet flooring and the industrial tunnel entrance. The sample remains three spaces and four guards; combat rules and the three-stage campaign are unchanged.

## Changes

- Metre-scaled concrete UVs, rounded architectural edges, generated weathered concrete albedo with bump relief; damp patches, pour seams and formwork ties.
- Desktop ambient occlusion and selected lamp shadows; warm downward practical lights with dim bounce, cool daylight on the gun, moving ocean normal detail and atmospheric sky. Touch devices omit the postprocessing and dynamic shadows.
- Gun recoil cylinders, sliding rails, trunnions, traversing rings, breech hardware and bolts; generated worn-steel texture shared across machinery and weapon.
- Tunnel blast door, ventilation fan, cable runs, ducting, lamp cages and continuous barrel vault. Detail stays against walls or inside existing gun/cover footprints.
- MP40 cocking handle, ejection port, barrel collars, folding stock, trigger guard, grip and finger detail.
- The modern tactical guard is replaced with nisu's CC0 WWII German soldier mesh: period helmet, tunic, leather equipment and boots. The original texture masks a new detailed atlas, preserving wool coloration. Authored breathing/patrol clips and rifle-arm posing use this skeleton.

This is closer to the artwork's material language and lighting, but remains a real-time browser prototype: the guard mesh is low polygon, the artillery is procedural and reflections are approximations. It is not a photorealistic match to the concept render.

## Asset provenance

The character source and license are recorded in [LICENSE.txt](../public/models/bunker/LICENSE.txt). The stronger Panzergrenadier asset researched on BlendSwap required a signed-in download and was not incorporated.

Three new project assets were generated with the built-in image-generation tool. Existing assets were preserved. PNG outputs were converted to JPEG for delivery.

- `public/textures/bunker-weathered-concrete.jpg`
- `public/textures/bunker-worn-steel.jpg`
- `public/models/bunker/ww2-soldier-detailed.jpg`

### Concrete prompt

Use case: historical-scene. Asset type: seamless tileable diffuse/albedo texture for a real-time 3D WWII coastal bunker. Create a square ultra photorealistic orthographic surface scan of aged poured concrete, covering about 2 metres square. Dense fine mineral aggregate, chipped cement, hairline cracks, salt efflorescence, irregular damp dark charcoal patches, weathered grey beige concrete with subtle moss in pits, subtle horizontal wooden formwork imprint. Rich real photographic microdetail. Diffuse flat neutral illumination, absolutely NO directional lighting, cast shadows, perspective, vignette, objects, lettering, tiles or brick outlines. Seamless repeating edges. Weathered grim coastal bunker like realistic 1940s casemate concept art, not clean modern cement. The output fills entire square with one continuous concrete material.

### Steel prompt

Use case: historical-scene. Asset type: one seamless square albedo material texture for 3D WWII coastal artillery gun metal. Orthographic flat photograph scan of weathered dark grey painted steel: mostly charcoal grey worn paint with small irregular chipped edges exposing muted bare steel, fine scratches, subtle brown rust freckles and grease stains. Extremely realistic dense microdetail, no objects, no panel outlines, no large rust holes, no text, no shadows, no directional lighting, no perspective. Subdued dark military industrial metal. Texture fills entire frame and repeats seamlessly.

### Uniform prompt

Edit this exact 3D soldier UV texture atlas into a photorealistic WWII German army infantry uniform material. CRITICAL: preserve the exact canvas dimensions, every existing colored island shape, its silhouette, and every island's location. This image is wrapped onto an existing 3D character, so do NOT rearrange any texture islands and do not draw a full character or clothing reference sheet. Add fine realistic detail inside existing regions only. Dark grey clothing regions become medium-dark field-grey wool with subtle fabric weave, seam stitching, wrinkles and weathering. Pure black boot and belt regions remain black with worn leather grain and stitching. Brown strap/pouch regions become weathered dark brown leather. Orange skin regions become natural muted human skin with photographic pores and shading, and add anatomically plausible eyes, brows, nose shading and lips in the existing two large oval face regions at lower left. Red patches become muted field-grey cloth, no red armbands. Helmet islands worn charcoal steel. Keep the black background black. Strictly preserve this UV layout so it wraps correctly. Flat diffuse albedo lighting. No text, no new symbols, no watermark.
