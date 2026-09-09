# Stage 2 validation

2026-09-09, local preview.

- Campaign entry: Stage 1 victory action advances to Stage 2; opening briefing provides a labeled practice entry. Browser verified practice entry, return to campaign, and repeated stage changes.
- Browser inspected the close first-person gun/bunker view, infantry and cover, desktop and 390×844 portrait controls. Portrait uses a wider horizontal view; the embrasure opening was widened to avoid masking the outer lanes. Temporary viewport override was reset.
- Browser automatic-fire run produced 48 shots and two defeated infantry, with barrel heat and overheat lockout active. Pause preserved combat state and released fire; defeat and retry worked. Final preview left on the Stage 2 briefing.
- Clean browser console: no errors or warnings in the final test tab.
- Independent review found and corrected fixed-plane mouse aiming (now body instances resolve to soldier coordinates) and breached soldiers remaining visible (now removed). Infantry converge toward the bunker after the last cover row.
- 21 automated tests pass, including a full three-wave encounter won with 36 kills using only normal simulation aiming/firing and heat management. TypeScript, authored-source lint, and production static export pass. Existing large Three.js client-chunk warning remains.

Subjective audio listening and device-specific frame-rate certification are not claimed. This update is local; the previous hosted version remains unchanged.
