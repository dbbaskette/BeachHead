# Grounded guard falls: references and implementation

The previous free ragdoll had too much freedom: the trunk could compress to 65% of its starting length, knees could fold almost completely, and corrective joint movement could feed energy into the next frame. Loose independent limbs exaggerated the effect.

## Research used

- [Epic: physics-based animation](https://dev.epicgames.com/documentation/unreal-engine/physics-driven-animation-in-unreal-engine?lang=en-US) describes blending animation and simulation. This supports a short controlled response followed by physical settling, rather than dropping every joint into an unconstrained state at impact.
- [SideFX: ragdoll simulations](https://www.sidefx.com/docs/houdini/character/kinefx/ragdoll.html) documents joint limits, collision shapes and matching input animation with stiffness and damping. This informed the firmer torso, limb limits and diminishing pose control.
- [Hsiao and Robinovitch, 1998: Common protective movements govern unexpected falls from standing height](https://pubmed.ncbi.nlm.nih.gov/9596532/) reports repeatable limb/trunk responses during induced falls on a gymnasium mattress, including trunk rotation in lateral falls and closely timed wrist/pelvis contact.
- [Inoue, 2005: Protective movements during sideways falls from standing height](https://pubmed.ncbi.nlm.nih.gov/16079583/) observes frequent forward and lateral flexion in volunteers falling onto a sport mat.

The fall studies provide movement reference, not evidence of firearm injury responses. No claim is made that this procedural animation reproduces a particular real injury, or that motion-capture footage was acquired. The references guide weight, support and contact sequencing.

## Three procedural performances

1. **Backward stumble:** brief foot support and a small recovery step; the chest moves behind the hips while legs stay extended longer, then the back and arms settle.
2. **Knee-first buckle:** earlier loss of hip height, asymmetric knee flexion, a shorter trunk lean and a later tip onto the floor.
3. **Sideways collapse:** lateral trunk lean, staggered support release and an asymmetric arm response before the landing.

These drive the physical skeleton briefly, fading out by about one second. Ribcage and pelvis braces remain firm; waist motion, hip spread, elbows and knees have limits. Pose corrections balance motion between connected parts, and constraint-generated velocity is damped so a floor contact cannot become a spring. Joint motion is damped relative to shared body velocity. Sleep uses actual world displacement, and later hits wake the body without restarting its performance.

Bullet reactions are localized; the previous exaggerated whole-body bullet lift is removed. Grenades retain stronger outward/lifting impulses and bypass foot support. All profiles still collide with walls, doors and props. Blood effects, gameplay controls and the expanded map are unchanged.

## Verification

Actual WWII model tests cover distinct trajectories, torso dimensions under repeated hits and blasts, multiple facings, floor and wall bounds, grenade launch into a door, pause/retry, sleep/wake and frame-rate agreement. A temporary visual study compares the three reactions in quarter-second steps and is removed before building. All 151 game tests, typecheck, lint and the production Pages build pass.
