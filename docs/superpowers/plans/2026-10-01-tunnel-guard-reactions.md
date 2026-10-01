# Tunnel guard reactions

Improve the existing bunker sample under the user's request; no new level or extra mechanics outside guard awareness and physical reactions.

- Replace instant tracking with a field of view, brief recognition, bounded head/body turning and a weapon-ready transition. Gunfire can attract nearby guards. Hidden players are not tracked: guards search their last known position, then settle into a cautious stance. Shooting still needs line of sight and a readable aim wind-up.
- Keep hit reactions localized and directional. Interrupt shots, briefly stagger and recover, with stronger knee response to leg wounds.
- Replace a rigid rotation around the feet with a pelvis-centered, articulated collapse. Choose forward/back/side/knee-led falls from impact direction, wound and available room. Freeze the dying guard's facing, bend limbs asymmetrically, settle against the floor and detach the rifle with modest gravity-driven motion. No exaggerated projectile-force launch.
- Preserve existing movement/touch controls, performance budgets, paused state and retry behavior. No floating enemy labels.
- Verify sight/recognition, turning, lost-sight memory, hearing, firing interruption, directional fall choice, floor contact, dropped-weapon reset and full sample completion. Inspect actual browser reactions and the settled result; run the full relevant test suite and production checks before the established PR/merge/publication workflow.

## Completed
Implemented awareness/search and directional articulated falls. Extracted the rig animation into a separately testable module. Added actual-asset tests for floor contact, dropped rifle settling and retry restoration; 140 total tests pass, along with typecheck and lint. Local browser confirms visible recognition/hit/collapse and no console errors. Production build and public deployment are checked through the established publishing workflow.
