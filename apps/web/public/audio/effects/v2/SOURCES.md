# Ravens effects audio v2

Runtime files are separate MP3 stems (mono, 44.1kHz, 128kbit/s), loaded only when
needed. The manifest records each final SHA256, source archive/recording SHA256,
decoded duration/size/peak/RMS, cue baseline and rebuild command. PCM masters and
downloaded originals remain in the external cache. No movie, actor or paid API
recordings are distributed.

## Recorded material

The primary source pages and license were inspected on 2026-11-12. Additional
sounds: **Joseph SARDIN — BigSoundBank.com**, [license](https://bigsoundbank.com/licenses.html)
(CC0 1.0; commercial use, modification and redistribution expressly allowed).

- Bell: Joseph SARDIN & Axeline T., [Bell 1 O'clock #3446](https://bigsoundbank.com/cloche-1h-s3446.html).
  A single actual church tower stroke recorded in La Loupe, France. Night/dawn
  are different pitch/EQ/decay treatments of that recording, never sine-bell
  substitutes. Runtime schedules three / two copies, with independently mixed tails.
- Paper 1: DavidGreck, [Turned Page #164](https://bigsoundbank.com/turned-page-s0164.html).
- Paper 2–4: Joseph SARDIN, paperback page recordings
  [#2213](https://bigsoundbank.com/pages-that-turn-6-s2213.html),
  [#2214](https://bigsoundbank.com/pages-that-turn-7-s2214.html),
  [#2211](https://bigsoundbank.com/pages-that-turn-4-s2211.html).
  These are four distinct physical takes, trimmed to one turn each; not white noise.
- Coughs: Joseph SARDIN, three different recorded takes
  [#2181](https://bigsoundbank.com/man-cough-3-s2181.html),
  [#2186](https://bigsoundbank.com/man-cough-8-s2186.html),
  [#2187](https://bigsoundbank.com/man-cough-9-s2187.html).
  Runtime uses these only for the poisoner's symbolic local submission feedback.

The following pinned CC0 sources from v1 remain in use:

- [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds), CC0 archive
  license verified: metal, plate, wood, soft and punch foley, recut into separate
  mechanical/material/UI stems and different role rhythms.
- [TinyWorlds Glass Break](https://opengameart.org/content/glass-break), CC0:
  initial fracture, trailing shards, bottle and quiet crystal texture.
- [HaelDB Male Grunt/Yelling sounds](https://opengameart.org/content/male-gruntyelling-sounds),
  CC0 option selected: three distinct short grunts and three distinct longer
  yells, with less muffled EQ than v1. The vocal source names are in the manifest.
- The **accepted My lord. voice** is retained from the existing local Microsoft
  Zira Desktop rendering and its v1 processing chain. Only silence is trimmed;
  speaking tempo/timbre is preserved. Its measured spoken region is 768ms,
  with a bow hold of 868ms. This is not a named performer's recording or imitation.

## Original layers and timing

Air movement, bubble oscillations, subtle heartbeat/string resonances and their
role-specific arrangements are deterministic project sound design. Recorded
paper flutter plus soft physical foley form the wing-flap layer; separate air
and root stems avoid an explosive "boom" in place of flapping. Death cries,
bone/wet impacts are separate from attempted private attacks.

`role-{roleId}` tracks start at **scene500ms** and place their internal foley
relative to the scene matrix. They contain no target names, hidden states or
result-specific voiced claims. `butler-voice` starts at scene1450ms; the shared
timing is in `butler-timing.json` and the full manifest. UI and paper are low
level and must still obey the master sound preference. Night/dawn stems are a
single hit each; do not play them as an already assembled multi-bell sequence.

## Rebuild

```powershell
python scripts/build-effects-v2.py C:/external/effects-v2 C:/external/v1-source-cache
```

The second cache contains the v1 pinned `kenney.zip`, `yelling.zip`, `glass.wav`
and `my-lord-raw.wav`. The builder verifies archive hashes, validates downloaded
audio with ffprobe, creates every final file and validates its decoded peak.
Every new decoded MP3 peak is below -3dBFS; final runtime bus mixing still needs
its limiter and public/private/master controls. Device loudspeaker/headphone
listening quality remains a true-device acceptance step, not a metadata claim.

The builder also records EBU R128 integrated LUFS when a sample is long enough
to measure. All 22 role tracks are balanced near -19.4 LUFS, the three longer
night-death vocals near -21.4 LUFS, and the final deep night/dawn bells near
-20.1/-21.3 LUFS (their recorded hum-note bodies are 137/153Hz).
Paper and UI are deliberately quieter. Material layers use soft-knee crest
compression so one recorded handling spike cannot make the entire rustle or
bell body inaudible; the spoken My lord waveform keeps its accepted processing.
