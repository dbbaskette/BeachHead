# Stage 3 — issue index

[Planning epic: Break the Landing](https://github.com/dbbaskette/BeachHead/issues/3)

The selected direction is guided attack passes with automatic forward flight, banking, altitude control, strafing and bombs. Stage 3 is implemented. The issue board tracks integration and remaining real-device/audio playtest evidence; see [validation](stage-3-validation.md).

- [Mission design](stage-3-air-assault-plan.md)
- [Implementation sequence](superpowers/plans/2026-09-30-stage-3-air-assault.md)
- [Live task board](https://github.com/dbbaskette/BeachHead/issues?q=is%3Aissue+label%3Astage-3-task)

| Work | Issue | Dependencies |
| --- | --- | --- |
| AIR-01 — Guided flight and input prototype | [#4](https://github.com/dbbaskette/BeachHead/issues/4) | Implementation requested |
| AIR-02 — Guns, ballistic bombs and honest aiming aids | [#5](https://github.com/dbbaskette/BeachHead/issues/5) | [AIR-01](https://github.com/dbbaskette/BeachHead/issues/4) |
| AIR-03 — Landing-force targets and persistent destruction | [#6](https://github.com/dbbaskette/BeachHead/issues/6) | [AIR-01](https://github.com/dbbaskette/BeachHead/issues/4), [AIR-02](https://github.com/dbbaskette/BeachHead/issues/5) |
| AIR-04 — Evasive flak and aircraft damage | [#7](https://github.com/dbbaskette/BeachHead/issues/7) | [AIR-01](https://github.com/dbbaskette/BeachHead/issues/4), [AIR-03](https://github.com/dbbaskette/BeachHead/issues/6) |
| AIR-05 — Three-pass mission, objectives and debrief | [#8](https://github.com/dbbaskette/BeachHead/issues/8) | [AIR-01](https://github.com/dbbaskette/BeachHead/issues/4), [AIR-02](https://github.com/dbbaskette/BeachHead/issues/5), [AIR-03](https://github.com/dbbaskette/BeachHead/issues/6), [AIR-04](https://github.com/dbbaskette/BeachHead/issues/7) |
| AIR-06 — Cockpit, coastline and readable target art | [#9](https://github.com/dbbaskette/BeachHead/issues/9) | [AIR-01](https://github.com/dbbaskette/BeachHead/issues/4), [AIR-03](https://github.com/dbbaskette/BeachHead/issues/6), [AIR-05](https://github.com/dbbaskette/BeachHead/issues/8) |
| AIR-07 — Impact effects and aircraft audio | [#10](https://github.com/dbbaskette/BeachHead/issues/10) | [AIR-02](https://github.com/dbbaskette/BeachHead/issues/5), [AIR-03](https://github.com/dbbaskette/BeachHead/issues/6), [AIR-04](https://github.com/dbbaskette/BeachHead/issues/7), [AIR-06](https://github.com/dbbaskette/BeachHead/issues/9) |
| AIR-08 — Campaign, menu and complete controls | [#11](https://github.com/dbbaskette/BeachHead/issues/11) | [AIR-05](https://github.com/dbbaskette/BeachHead/issues/8), [AIR-06](https://github.com/dbbaskette/BeachHead/issues/9), [AIR-07](https://github.com/dbbaskette/BeachHead/issues/10) |
| AIR-09 — Integrated playtest, performance, balance and release | [#12](https://github.com/dbbaskette/BeachHead/issues/12) | [AIR-01](https://github.com/dbbaskette/BeachHead/issues/4), [AIR-02](https://github.com/dbbaskette/BeachHead/issues/5), [AIR-03](https://github.com/dbbaskette/BeachHead/issues/6), [AIR-04](https://github.com/dbbaskette/BeachHead/issues/7), [AIR-05](https://github.com/dbbaskette/BeachHead/issues/8), [AIR-06](https://github.com/dbbaskette/BeachHead/issues/9), [AIR-07](https://github.com/dbbaskette/BeachHead/issues/10), [AIR-08](https://github.com/dbbaskette/BeachHead/issues/11) |

Each issue contains acceptance criteria and a verification owner. The integration issue owns final full-suite, build, performance and browser evidence. Live open/closed counts in the README use the `stage-3-task` label; the epic uses only `stage-3` so it is not double-counted.
