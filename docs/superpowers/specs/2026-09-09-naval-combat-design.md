# Focused 3D naval combat

The user approved the focused 3D browser direction and naval first playable on 2026-09-09. This document makes that approved proposal concrete.

## Experience

A complete short naval engagement seen from the forward guns of a warship. Begin at a game-native briefing over the live ocean scene. Start the encounter, aim horizontally, adjust range/elevation, fire, correct using long/short feedback, survive return fire, sink three ships, and replay. No campaign or tank stages in this increment.

## Visual direction

Early morning in a tropical strait: slate-blue water (#183f51), pale atmospheric sky (#b9d3dc), weathered naval steel (#536269), warm instrument ivory (#ebe7d8), and signal amber (#e9b96b). Fullscreen 3D scene dominates. A thin status bar, floating target readout, centered aiming reticle, lower instrument rail, and compact briefing provide game-native framing. Use condensed bold typography for the title and clear sans-serif controls. Original procedural ship models, island terrain, ocean shader, smoke, splashes, and synthesized sound. No borrowed game assets.

## Architecture

Use the Sites starter with client-side React, TypeScript, Three.js, and Vite. Keep simulation independent of rendering: a deterministic fixed-step combat model owns ship positions, health, shells, reload, incoming fire, elapsed time, and victory/defeat. Three.js owns cameras, procedural geometry, water, lighting, and pooled transient effects. React owns briefing, HUD, controls, pause, and results. Audio starts only on user action.

## Combat contract

World units are meters. Player is at (0,0,0), enemies occupy x/z sea coordinates, forward is negative z. Heading is degrees, positive right. Gun elevation maps to ballistic range. Three enemies are within a roughly 90-degree forward arc. Shells travel along visible arcs; impact tests against enemy footprints. Misses report range correction. Enemy fire uses visible warnings and eventual damage. Unlimited ammunition with a reload delay. Target selection assists range discovery but never fires or silently corrects a shot. Gameplay freezes when paused or the tab loses visibility.

## Controls and resilience

Mouse drag or A/D turns guns; W/S adjusts range; click or Space fires; Tab cycles target; Escape pauses. Visible buttons also provide range, bearing, fire, and target actions. No pointer-lock requirement. Settings include sound and reduced camera motion. Keep inputs out of editable elements and prevent page scrolling only for game keys while playing. Show an actionable error if WebGL initialization fails. Resize the canvas and cap pixel ratio at 2. Clean up listeners, animation loops, GPU resources, and audio on unmount.

## Verification

Meaningful simulation tests cover reload, ballistic range, hits/misses, terminal states, pause, and restart. Run typecheck, full relevant unit suite, and production build before completion. Browser interaction testing is not explicitly requested; do not claim a visual playtest. Provide the local preview and a private deployed version when Sites is available.
