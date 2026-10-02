# Guard animation source and integration

Downloaded through the owner's signed-in Adobe Mixamo account on October 2, 2026.
Source: [Mixamo](https://www.mixamo.com/) — Pro Rifle Pack, 30 fps, FBX Binary,
No Character. Twelve clips are retargeted onto the existing CC0 WWII soldier.

The gameplay data is `public/models/bunker/guard-motions.json`. It contains only
rig-specific animation tracks used by this game. Adobe Mixamo motion content
retains its own terms; it is not covered by an open-source license on our code.
Do not redistribute it as a standalone animation library or asset package.
Original FBX downloads remain local, outside tracked game assets.

Adobe's [Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)
allows use of characters and animations in personal and commercial video games.

Included motions: rifle idle, aiming idle, forward/backward/left/right walking,
left/right turns, and four directional/head-impact deaths. Gameplay controls
translation and facing. Root travel is removed from locomotion; death travel is
retained. Source and target rest frames are reconciled per bone, preserving the
WWII model's limb lengths. Rifle position follows the animated hands.

Nonfatal shot flinch and muzzle recoil remain small procedural overlays. The
final death pose is held, rather than released into the procedural ragdoll.
The original constrained solver remains available as a tested fallback.

To reproduce the data from your own downloaded pack:

```
node --import tsx scripts/import-guard-motions.ts /path/to/extracted/pack
```

The importer trims only the extra newline the pack exporter appends after its
binary FBX footer. It does not modify the original downloads.
