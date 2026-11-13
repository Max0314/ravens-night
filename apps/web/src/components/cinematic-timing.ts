/** One clock for material motion and audio. Values never change public result gates. */
export const cinematicTiming = {
  butler: { ready: 733, bow: 1400, voice: 1450, voiceDuration: 768, rise: 2268, upright: 2935, end: 4002 },
  poison: { uncork: 700, tiltStart: 700, pour: 950, bubbles: 1100, stopPour: 1600, cough: 1700, upright: 2050 },
  demon: { flap: 600, air: 850, open: 1100, left: 1700, right: 2250, avatarLeft: 2900, avatarRight: 3450 },
  envelope: { seal: 600, flapStart: 850, flapOpen: 1450, paperStart: 1450, paperOut: 2150 },
  investigator: { scanStart: 650, focus: 1150, turn: 1400, settle: 1800 },
  crystal: { start: 500, answer: 2200 },
  washer: { dipStart: 600, immersed: 1100, scrubStart: 1100, liftStart: 1650, raised: 2100, dripStart: 1700, dripEnd: 2900, inkStart: 1900, inkSet: 2250 },
  book: { start: 650, middle: 1150, end: 1850 },
  coffin: { start: 600, open: 1600, reveal: 1900 },
  raven: { attention: 350, flapStart: 650, spread: 1225, feather: 1350, flapEnd: 1800, featherLanded: 1850, settle: 2400 },
  empath: { left: 650, right: 1050, echoDelay: 170, settle: 1850 },
  mayor: { lift: 400, contact: 850, document: 1050, settle: 1650 },
  armor: { contact: 700, settle: 1350 },
  drunk: { lift: 400, lean: 900, return: 1900, settle: 2600 },
  scarlet: { start: 650, wingStart: 900, open: 1750, settle: 2200 },
  flower: { outerStart: 500, innerStart: 850, open: 1750, ribbon: 950, settle: 2200 },
  recluse: { swing: 350, settle: 3000 },
  saint: { flame: 350, wax: 650, waxSet: 1900 },
  baron: { arrive: 350, stop: 800, doorStart: 900, doorOpen: 1400, seals: [1450, 1650], paperStart: [1550, 1750], paperOut: [2250, 2450], settle: 2700 },
  chef: [650, 1000, 1350],
  shield: { cue: 418, contact: 700 },
  reveal: { standard: 1900, oracle: 2200, bluffs: 2400 },
} as const;
export const unit = (v:number) => Math.max(0,Math.min(1,v));
export const smooth = (t:number,a:number,b:number) => {const p=unit((t-a)/(b-a));return p*p*(3-2*p);};
