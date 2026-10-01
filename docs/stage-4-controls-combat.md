# Bunker mobile controls and hit reactions

## Mobile release fix

Reported symptom: walking or firing continues after lifting a finger. The old page-level release handler only cleared mouse fire. Touch movement and fire each depended on their own element receiving pointerup/cancel/capture-loss events.

The bunker now routes every active pointer through one control owner. Capture-phase page listeners clear the matching action on pointerup, pointercancel and lostpointercapture, independent of the release target. Touch-end/cancel provides a Safari fallback: touch identifiers are associated with pointer contacts at touch start, then reconciled against the remaining fingers. Releasing one thumb preserves the other. Blur, page exit, rotation, pause and retry clear held input. There is no idle timeout that would stop a legitimate stationary hold.

## Walk and aim together

Left stick moves/straffes. Right stick continuously turns and adjusts elevation with a progressive response and quiet center. A separate Fire button sits above the right stick. View dragging and dragging Fire to aim remain available. The control state supports simultaneous movement, turning and firing without shared pointer ownership.

## Soldier response

Hits record their actual point, direction and wound region. Living guards briefly flinch/stagger and have their pending shot interrupted. Fatal wounds produce a short knee buckle and a jointed collapse with relaxed arms and rifle movement. Head and torso/leg wounds select different fall poses; body orientation is composed in local space so the final pose lies near the floor regardless of the guard's facing. These are authored animations, not a physics ragdoll.

Small impact droplets and fabric debris originate at the hit location. Falling blood droplets leave small, fading floor marks. Particles are capped at 160, marks at 32; both freeze on pause and clear on retry/scene disposal.

## Verification

Regression tests exercise simultaneous walk/turn movement, independent releases, missing element-level events, cancellation, lost capture, Safari touch IDs, interrupted sessions, fresh gestures after release, head/torso wound metadata, stagger and death behavior, and final collapse orientation. Browser playtesting checks the landscape/portrait layout, movement, looking without firing, firing/release, pause and visible guard collapses. The in-app browser cannot inject simultaneous native touches, so multi-finger event sequences are verified by the control integration tests; physical iPhone/Safari confirmation remains useful.
