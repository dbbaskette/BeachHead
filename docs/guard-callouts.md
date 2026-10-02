# German bunker guard callouts

Eight bundled German speech clips are used by Stage 5. Generated locally with
SayPipe 0.2.2 and Qwen3-TTS 1.7B CustomVoice, voice `aiden`, language `de`.
The source script and delivery instruction are in `guard-callouts.saypipe.json`.
No speech API, browser voice, credentials, or network synthesis is used by players.
The voices are synthetic, not recordings of a historical person.

| Trigger | German | Meaning |
| --- | --- | --- |
| Identifies player | Achtung! / Da ist er! | Attention! / There he is! |
| Survives a hit | In Deckung! / Beschuss! Deckung! | Take cover! / Incoming fire! Cover! |
| Sees nearby grenade | Handgranate! / Handgranate! Weg da! | Hand grenade! / Hand grenade! Get away! |
| Searches after losing contact | Wo ist er? / Sucht ihn! | Where is he? / Find him! |

The director selects a nearby living guard, with a 3.6-second shared cooldown and
9-second per-guard cooldown for normal lines. A visible grenade within six metres
can interrupt speech after a shorter cooldown, once per grenade. Search lines wait
1.2 seconds after loss of contact. Thick walls suppress distant guards; nearby
occluded speech is quieter and low-pass filtered. Panning follows player bearing.
No dialogue text is added to the battlefield.

Only one clip plays at once. Pause, mute, speaker death, leaving the stage, and
retry stop or clear speech. Gameplay time drives cooldowns. The existing sound
button controls effects and guard speech together.

Source takes and SayPipe manifests stay in ignored `work/guard-voices/final/`.
SayPipe verification found no clipping or silent clips. Local speech recognition
was used to catch extra words, followed by replacement takes. Final MP3s are mono
44.1 kHz/96 kbps, high-/low-pass filtered and loudness-normalized. Runtime Web Audio
adds distance filtering and two short room reflections. Do not regard automated
recognition as a substitute for native-speaker performance review.
