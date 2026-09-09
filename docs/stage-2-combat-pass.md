# Stage 2 combat and pacing pass

- Waves now contain 18 / 24 / 30 infantry, deployed in groups of six. Individual arrivals are 0.2 seconds apart; groups are separated by 2.4 seconds.
- Advance speed varies from 3.22–3.78 m/s (previously 9). Run animation rate follows speed; soldiers turn toward their actual movement direction.
- A cached visibility graph routes soldiers around shared steel, concrete, and wire footprints with 0.7 m body clearance. Cover stops sit behind the concrete; routes leave around the ends. Wire has visible gaps and nearby rubble sits clear of the final approach.
- Death reactions settle from the current stride over 0.65 seconds. Added helmets follow the head and detach into a bouncing, spinning effect on defeat. Impacts emit red droplets and temporary irregular sand stains. These are stylized effects, not ragdoll physics.
- Heat increases by 2.5 per round, allowing 40 rounds / about five seconds before lockout. Cooling is 32 units/second; recovery to 30 takes about 2.2 seconds.
- Effects and corpses remain capped and are disposed on retry or stage exit.

Validation: 23 automated tests cover wave completion, density, longer bursts, route segments, live movement clearance, cover, pause, retry, and breach loss. Browser playtest exercised squad advances, wire gaps, aimed automatic fire, two kills and overheat/recovery without runtime errors.
