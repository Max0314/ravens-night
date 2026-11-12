import './butler-bow.css';

/** Measured from the accepted v1 spoken stem; rebuilt with build-effects-v2.py. */
export const butlerBowTiming = {
  voiceAt: 1450, spokenDurationMs: 768, holdStart: 1400,
  holdMs: 868, riseAt: 2268, durationMs: 4002,
} as const;

export function butlerBowFrame(elapsedMs: number): number {
  const t = Math.max(0, elapsedMs - 400);
  if (t < 333) return Math.min(7, Math.floor(t * 24 / 1000));
  if (t < 1000) return 8 + Math.min(15, Math.floor((t - 333) * 24 / 1000));
  if (t < 1000 + butlerBowTiming.holdMs) return 24 + Math.floor((t - 1000) * 24 / 1000) % 12;
  const rise = t - 1000 - butlerBowTiming.holdMs;
  if (rise < 667) return 36 + Math.min(15, Math.floor(rise * 24 / 1000));
  return 52 + Math.min(3, Math.floor((rise - 667) * 24 / 1000));
}

/** Feet remain on the same baseline in all frames; no cropping or body-piece rotation. */
export function ButlerBow({ elapsedMs, reducedMotion = false }: { elapsedMs: number; reducedMotion?: boolean }) {
  const frame = reducedMotion ? 0 : butlerBowFrame(elapsedMs);
  return <div className="butler-bow" role="img" aria-label="西装管家向主人完整鞠躬" data-frame={frame}
    style={{ backgroundPosition: `${frame % 8 / 7 * 100}% ${Math.floor(frame / 8) / 6 * 100}%` }} />;
}
