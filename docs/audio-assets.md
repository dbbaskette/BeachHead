# Naval audio assets

The naval effects are adapted from **Battle at sea** by Eike Germann
(Thimras), published on OpenGameArt. The complete source pack is released
under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), so credit
is not required. It is included here for provenance and thanks.

Source page: <https://opengameart.org/content/battle-at-sea>  
Retrieved: 2026-09-09

| Bundled file | Game event | Original file | Direct source |
| --- | --- | --- | --- |
| `naval-cannon-fire.mp3` | Player cannon fire | `cannon_fire.ogg` | <https://opengameart.org/sites/default/files/cannon_fire_1.ogg> |
| `naval-ship-impact.mp3` | Shell striking a ship | `cannon_hit_ship_short.ogg` | <https://opengameart.org/sites/default/files/cannon_hit_ship_short.ogg> |
| `naval-water-splash.mp3` | Shell missing into the sea | `cannon_miss.ogg` | <https://opengameart.org/sites/default/files/cannon_miss_1.ogg> |
| `naval-metal-damage.mp3` | Enemy shell striking the player | `cannon_hit_cannon.ogg` | <https://opengameart.org/sites/default/files/cannon_hit_cannon_1.ogg> |

The originals are stereo Ogg Vorbis at 48 kHz. The bundled copies were
trimmed after their audible tails, faded at the cut where needed, resampled to
44.1 kHz stereo, and encoded as 112 kbps MP3 for broad browser support. The
water splash was lowered by 2 dB to sit behind the cannon and impact sounds.

| Bundled file | Duration | Size | SHA-256 |
| --- | ---: | ---: | --- |
| `naval-cannon-fire.mp3` | 2.08 s | 30,033 bytes | `2d69d2e1c504b1c961b2f62269829ba98eea6d07cd1a5dfac1d5565a4cbe8235` |
| `naval-ship-impact.mp3` | 3.05 s | 43,564 bytes | `10127551c68c5902453d79f426143b4102856c061d621d23667573615df9ca8e` |
| `naval-water-splash.mp3` | 1.57 s | 23,084 bytes | `defde8d2c618c0a9fc18fb5de1d23aebbb849c17f9eeaae98ab099f853965ed1` |
| `naval-metal-damage.mp3` | 2.76 s | 39,541 bytes | `f204779fc28f116235bfc7b68f0b85daba4d1e738915e2b31b3d918921fdfe6d` |

`NavalAudio.preload()` fetches these files without constructing an
`AudioContext`, so it may run during page setup. `NavalAudio.start()` remains
the user-gesture boundary that constructs and resumes the context. If decoding
has not completed when a sound is requested, a small preallocated synthesized
fallback keeps the action audible.
