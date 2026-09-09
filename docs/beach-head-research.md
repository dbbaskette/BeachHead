# Beach-Head remake: research and starting proposal

Date: 2026-09-09
Status: research complete; proposed direction awaiting user input. No implementation yet.

## Historical reference

Beach-Head was published by Access Software in 1983; the Centre for Computing History credits Bruce Carver.
Source: https://www.computinghistory.org.uk/det/11754/Beach-Head/

The manual describes six sequences: reconnaissance, an optional hidden passage, anti-aircraft defense, naval gunnery, tank assault, and a fortress battle. The passage trades navigation danger for a surprise advantage. Gunnery uses elevation and long/short feedback. Surviving ships supply tanks; fortress damage persists across tank attempts. Ten sequential vulnerable targets complete the finale.
Source: https://www.lemon64.com/doc/beach-head/92

The manual is a transcription covering Commodore and Atari versions. Platform-specific controls should be checked against C64 footage before seeking exact fidelity. PDF manual links at Games Database could not be fetched during this research.

## Design interpretation

The defining experience is one invasion told through different arcade mechanics, with losses affecting later stages. Preserve that connection, clear silhouettes, quick controls, and escalating stakes.

## Proposed modernization

Recommended: faithful stage structure with modern 3D presentation and tightly constrained cameras. Ocean swell, atmospheric islands, detailed ship silhouettes, smoke, tracers, splash columns, spatial sound, and readable instruments should support the action. Use original artwork and audio.

Alternatives: a high-resolution 2D remake for closer visual fidelity and smaller scope; or a freely explorable 3D combat game with substantially greater production scope and less resemblance to the original loop.

First playable proposal: one shipboard naval engagement with aiming, adjustable elevation, shell travel, impact feedback, enemy return fire, ship damage, victory/defeat, and restart. Target a short, replayable encounter. Add anti-aircraft combat next, then fleet routing, tanks, and the fortress.

Platform proposal: desktop browser first for convenient iteration and sharing. Engine selection follows agreement on browser versus native desktop delivery and desired visual ambition.

Acceptance for the first playable: understandable controls, credible aiming and damage, a complete encounter, attractive high-resolution presentation, responsive resizing, and stable performance on the target machine. Verify combat rules with targeted automated tests and complete the relevant suite plus a manual playthrough before delivery.

## Decisions to settle

Confirm the proposed faithful 3D direction, initial naval encounter, and browser delivery before selecting the engine and writing the implementation plan.
