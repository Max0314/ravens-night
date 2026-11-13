/** One clock for material motion and audio. Values never change public result gates. */
export const cinematicTiming = {
  butler: { ready: 733, bow: 1400, voice: 1450, voiceDuration: 768, rise: 2268, upright: 2935, end: 4002 },
  poison: { uncork: 700, tiltStart: 700, pour: 950, bubbles: 1100, stopPour: 1600, cough: 1700, upright: 2050 },
  demon: { flap: 600, air: 850, open: 1100, left: 1450, right: 1750, avatarLeft: 2050, avatarRight: 2350 },
  book: { start: 650, middle: 1150, end: 1850 },
  coffin: { start: 600, open: 1600, reveal: 1900 },
  chef: [650, 1000, 1350],
  shield: { cue: 418, contact: 700 },
  reveal: { standard: 1900, oracle: 2200, bluffs: 2400 },
} as const;
export const unit = (v:number) => Math.max(0,Math.min(1,v));
export const smooth = (t:number,a:number,b:number) => {const p=unit((t-a)/(b-a));return p*p*(3-2*p);};
