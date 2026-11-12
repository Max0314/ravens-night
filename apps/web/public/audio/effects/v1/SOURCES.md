# Ravens effects audio v1

Ten self-contained MP3 cues, mono 44.1 kHz / 160 kbit/s. The runtime loads these
on demand and applies public/private playback permissions. Private demon audio
does not contain a human scream; `scream.mp3` is reserved for a published death.
The files contain original layered sound design, not television recordings.

## Source material

- **TinyWorlds — Glass Break**, selected CC0-1.0.
  Source: <https://opengameart.org/content/glass-break>
  File: <https://opengameart.org/sites/default/files/glass_breaking.wav>
- **HaelDB — Male Grunt/Yelling sounds**, selected CC0-1.0 from the author's
  CC0 / OGA-BY license offer. The page describes four recorded male vocalists.
  Source: <https://opengameart.org/content/male-gruntyelling-sounds>
  Archive: <https://opengameart.org/sites/default/files/yelling%20sounds.zip>
  Used entries: `yelling sounds/3grunt1.wav` (short hurt),
  `yelling sounds/3yell1.wav` (quiet, distant evil-victory lament).
- **Kenney — Impact Sounds 1.0**, CC0-1.0, confirmed from both source page
  and the downloaded archive's `License.txt`.
  Source: <https://kenney.nl/assets/impact-sounds>
  Used entries: `impactMetal_heavy_000`, `impactMetal_light_001`,
  `impactPlate_heavy_001`, `impactWood_heavy_001`, `impactSoft_heavy_000`,
  `impactPunch_heavy_002` under the archive's `Audio/` directory.
- **Original local synthetic reading** of “My lord.” using installed Windows
  Microsoft Zira Desktop, lowered, filtered and lightly reverberated into a deep
  register. This is not a recording or imitation of a named actor.
- **Original authored layers**: pressure impulse, liquid bubbles, acid hiss,
  wing/cloth air, dry fracture transients, resonant shield tones, and short
  good/evil musical motifs, generated deterministically by the build script.

Source archive SHA256, final file SHA256, duration, decoded peak/RMS and layer
descriptions are in `manifest.json`. Source pages were read on 2026-11-12.
The source archives and unprocessed voice stay in the local external cache;
only final assets and provenance are distributed with the game.

## Rebuild

The scripts are repository-root relative. Use an external cache directory;
ffmpeg with libmp3lame and Windows System.Speech / Zira Desktop are required.

```powershell
./scripts/prepare-effects-voice.ps1 -CacheDirectory C:/path/to/effects-cache
python scripts/build-effects-audio.py C:/path/to/effects-cache
```

The builder downloads public CC0 sources when missing, verifies pinned archive
hashes, mixes the cues with a fixed random seed and checks the decoded MP3
peaks remain below -1 dBFS with non-silent RMS. Decoder/voice versions can affect
exact bytes; committed files and their manifest are the release artifacts.
The generated files have been decoded and measured; mobile loudspeaker and
headphone listening quality still requires real-device audition.
