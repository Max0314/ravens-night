import './butler-bow.css';
import {cinematicTiming,unit} from './cinematic-timing.js';

/** Measured from the accepted v1 spoken stem; rebuilt with build-effects-v2.py. */
export const butlerBowTiming = {
  voiceAt: cinematicTiming.butler.voice, spokenDurationMs: cinematicTiming.butler.voiceDuration,
  holdStart: cinematicTiming.butler.bow, holdMs: cinematicTiming.butler.rise-cinematicTiming.butler.bow,
  riseAt: cinematicTiming.butler.rise, durationMs: cinematicTiming.butler.end,
} as const;

export function butlerBowFrame(elapsedMs: number): number {
  const b=cinematicTiming.butler;
  if(elapsedMs<b.ready)return 0;
  if(elapsedMs<b.bow)return Math.round(unit((elapsedMs-b.ready)/(b.bow-b.ready))*23);
  if(elapsedMs<b.rise)return 23;
  return Math.round((1-unit((elapsedMs-b.rise)/(b.upright-b.rise)))*23);
}

/** One neutral material skinned at the waist/neck/arm; pelvis, knees and ankles stay fixed. */
export function ButlerBow({ elapsedMs, reducedMotion = false }: { elapsedMs: number; reducedMotion?: boolean }) {
  const frame = reducedMotion ? 0 : butlerBowFrame(elapsedMs);
  return <svg className="butler-bow" role="img" aria-label="西装管家向主人完整鞠躬" data-frame={frame} viewBox="0 0 320 448" preserveAspectRatio="xMidYMid meet" overflow="hidden">
    <image href="/art/effects/v4/butler-bow.webp" x={-(frame%6)*320} y={-Math.floor(frame/6)*448} width="1920" height="1792"/>
  </svg>;
}
