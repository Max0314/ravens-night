import {experienceTiming,type ExperienceKind,type PresentationVersion} from '@ravens/contracts';
/** Small original, synthesized cues. Private cues are deliberately silent. */
let audioContext: AudioContext | undefined;
let enabled = readAudioPreference();
const scheduled = new Map<string,number>();
const playing = new Set<AudioScheduledSourceNode>();
export function silenceEffects(): void { for (const source of playing) { try { source.stop(); } catch { /* Already finished. */ } } playing.clear(); for(const[key,time]of scheduled)if(time>(audioContext?.currentTime??0))scheduled.delete(key); }

function readAudioPreference(): boolean { try { return localStorage.getItem("ravens_effects_audio") === "on"; } catch { return false; } }
export function effectsAudioEnabled(): boolean { return enabled; }
export async function enableEffectsAudio(value = true): Promise<void> {
  enabled = value;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("ravens-effects-audio"));
  try { localStorage.setItem("ravens_effects_audio", value ? "on" : "off"); } catch { /* Private browsing may not allow persistence. */ }
  if (!value) { silenceEffects(); return; }
  if (typeof AudioContext === "undefined") return;
  audioContext ??= new AudioContext();
  await audioContext.resume();
}

export function scheduleCue(id: string, kind: string, elapsedMs: number,version:PresentationVersion=1,emptyExecution=false): void {
  const ctx = audioContext;
  if (!enabled || !ctx || ctx.state !== "running") return;
  const cues=experienceTiming(kind as ExperienceKind,version).cues;
  for (const [at, cue] of cues) {
    const delay = Number(at) - elapsedMs;
    // Never play a gunshot late: reconnects reveal the result without replaying the strike.
    const key=`${id}:${at}`;if(delay<0||scheduled.has(key))continue;
    const time = ctx.currentTime + Math.max(0, delay / 1_000);
    scheduled.set(key,time);if(scheduled.size>500)scheduled.delete(scheduled.keys().next().value!);
    if (cue === "bell") bell(ctx, time);
    else if (cue === "shot") { noise(ctx, time, .24, .2, 650); tone(ctx, time, 84, .6, .13); }
    else if (cue === "mechanism") { if(emptyExecution)noise(ctx,time,1.3,.035,380);else{noise(ctx, time, .3, .1, 350); tone(ctx, time, 72, .4, .1);} }
    else noise(ctx, time, cue === "paper" ? .18 : .06, .055, 1_800);
  }
}

function tone(ctx: AudioContext, at: number, frequency: number, duration: number, volume: number) {
  const source = ctx.createOscillator(); const gain = ctx.createGain();
  source.type = "sine"; source.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + .008); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  source.connect(gain); gain.connect(ctx.destination); playing.add(source); source.onended = () => { playing.delete(source); source.disconnect(); gain.disconnect(); }; source.start(at); source.stop(at + duration + .03);
}
function bell(ctx: AudioContext, at: number) { [1, 2.76, 5.4].forEach((harmonic, i) => tone(ctx, at, 174 * harmonic, 2.1 - i * .35, .045 / (i + 1))); }
function noise(ctx: AudioContext, at: number, duration: number, volume: number, frequency: number) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource(); source.buffer = buffer;
  const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = frequency;
  const gain = ctx.createGain(); gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  source.connect(filter); filter.connect(gain); gain.connect(ctx.destination); playing.add(source); source.onended = () => { playing.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); }; source.start(at); source.stop(at + duration);
}
