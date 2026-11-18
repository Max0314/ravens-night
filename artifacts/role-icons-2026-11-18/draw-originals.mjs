import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const edge = '#f0d19b';
const ink = '#553b28';
const glint = '#fff0ca';
const red = '#98452f';
const gold = 'url(#bronze)';
const light = 'url(#light)';
const shape = (d, fill=gold, stroke=edge, width=2.4) =>
  `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
const cut = (d, width=4) => shape(d, 'none', ink, width);
const line = (d, width=2.4) => shape(d, 'none', glint, width);
const ring = (cx, cy, rx, ry, fill=gold, stroke=edge, width=2.4) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;

export const icons = {
  washerwoman: [
    shape('M17 45 65 12 85 40 37 73Z',light),
    shape('M27 47 64 22 75 39 38 64Z',ink,'none'),
    line('M35 47 65 27 M40 53 69 33 M44 58 72 39',3.2),
    shape('M10 75q7-7 14 0t14 0 14 0 14 0 M18 85q7-7 14 0t14 0 14 0','none',edge,3.4),
  ],
  librarian: [
    shape('M21 50V32l21-5v24 M39 50V17l24 2v32 M59 50V27l18 3v21',light),
    cut('M47 29h9 M47 36h9 M66 36l5 1',2.5),
    shape('M15 48h69v29l-7 9H22l-7-9Z'),
    shape('M21 54h57v24H21Z',light),
    cut('M39 62h20v9H39Z',2.8),
    line('M41 63h15',2.7),
  ],
  investigator: [
    shape('M57 62 70 54 88 75 86 83 78 89Z',gold),
    ring(40,40,26,26,light),
    ring(40,40,18,18,'#76573e',ink,2.4),
    shape('M40 28 51 40 40 52 29 40Z',light,'none'),
    line('M22 37q4-13 18-17 M76 70l7 8',2.4),
  ],
  chef: [
    shape('M18 67h64l6 8-6 8H17l-5-7Z'),
    line('M20 72h56',2.5),
    shape('M12 55 40 41 46 49 18 64q-9 4-6-9Z'),
    shape('M40 36 74 15q5-3 7 1l9 21q2 6-4 9L52 61Z',light),
    ring(72,29,4,4,ink,'none'),
    line('M53 55 85 39',2),
  ],
  empath: [
    shape('M19 37 27 25q11-13 23 0 11-13 23 0l8 12','none',edge,4.8),
    ring(50,25,5,5,ink,glint,2.4),
    shape('M25 30c-4 16-16 22-16 36a16 16 0 0 0 32 0c0-14-12-20-16-36Z',light),
    shape('M75 30c-4 16-16 22-16 36a16 16 0 0 0 32 0c0-14-12-20-16-36Z',light),
    shape('M25 51 33 67 25 76 17 67Z M75 51 83 67 75 76 67 67Z',ink,'none'),
    line('M22 60l-2 7 M72 60l-2 7',2.3),
  ],
  fortune_teller: [
    shape('M25 84q0-10 12-17h26q12 7 12 17Z',gold),
    shape('M17 89q2-7 8-8h50q7 2 8 8Z',light),
    ring(50,42,26,29,light),
    shape('M54 21q-16 10-14 24 2 15 19 16-22 7-28-14-6-20 23-26Z',ink,'none'),
    shape('M62 32l2 7 7 2-7 2-2 8-2-8-8-2 8-2Z',glint,'none'),
    line('M25 77q6 2 12 5 M75 77q-6 2-12 5',2.2),
  ],
  undertaker: [
    shape('M12 71 50 20 69 12 87 27 81 48 28 90Z',ink),
    shape('M22 70 54 28 69 21 80 30 75 43 31 82Z',gold),
    shape('M16 59 51 14 67 9 81 19 74 33 28 72Z',light),
    cut('M26 59 55 22 65 18 73 22 68 30 30 63Z',2.6),
    line('M38 50 57 27 M35 54l-5 6 M40 75l25-21',2.2),
  ],
  monk: [
    ring(50,50,34,34,light),
    ring(50,50,27,27,'url(#bronze)',ink,2.7),
    shape('M50 33 67 50 50 67 33 50Z',light),
    shape('M50 33v17h17L50 67V50H33Z',ink,'none',0),
    line('M28 35q7-12 22-12 M56 74q11-3 16-12',2),
    ...[[50,21],[79,50],[50,79],[21,50]].map(([x,y])=>ring(x,y,2.3,2.3,glint,'none')),
  ],
  ravenkeeper: [
    shape('M14 82q7-11 19-15l28-3q9 2 8 8l-19 4-7 12-15 3Z',gold),
    shape('M12 61 29 58l10-12q-3-18 13-27 12-5 19 5l16 7-15 6q1 17-16 24L28 69Z',light),
    shape('M18 60 43 51q-1-22 18-21-2 18-12 25L28 64Z',ink,'none'),
    shape('M45 64l-5 8 M53 62l-4 8','none',edge,3.4),
    ring(65,28,2.7,2.7,ink,'none'),
    line('M52 27q5-5 11-4 M21 83q8-5 16-6',2.3),
  ],
  virgin: [
    shape('M25 87Q65 59 59 26','none',edge,4.8),
    shape('M37 75q-24-2-25-18 19 3 30 13 M47 65q9-20 30-21-5 20-31 22',gold),
    shape('M57 47Q40 40 37 18q12-1 20 14l6-21q11 10 9 23l14-8q3 16-14 24-7 4-15-3Z',light),
    cut('M55 43q5-7 9-11 M64 46q7-5 12-7',2.4),
    ring(65,28,2.1,2.1,glint,'none'),
  ],
  slayer: [
    shape('M9 68 31 47 85 39 91 43 88 48 56 53 43 59 32 63 18 78 10 76Z'),
    shape('M38 54q-4 14 9 14 12-1 11-15','none',edge,4),
    shape('M51 46q-3-11-11-14l-4 5 7 9',light),
    cut('M13 69 30 55 M57 47l29-4',2.6),
    line('M17 71 33 55 M60 47 85 43',1.8),
  ],
  soldier: [
    shape('M22 68V35q0-15 17-21l11-4 11 4q17 6 17 21v33L68 86l-12-9H44l-12 9Z',light),
    shape('M27 40q22-9 46 0v13H58v19H43V53H27Z',ink,'none'),
    shape('M34 57v16l7 7 M66 57v16l-7 7','none',ink,2.6),
    line('M50 16v17 M28 34q5-13 16-15 M70 34q-4-9-11-13',2.4),
  ],
  mayor: [
    shape('M45 39h10v42l-5 9-5-9Z',gold),
    shape('M29 15h10v11h6V13h10v13h6V15h10v20l-8 10H37l-8-10Z',light),
    shape('M39 44h22v10H39Z',gold),
    cut('M47 36v-6h6v6 M34 35h7 M59 35h7',2.8),
    line('M48 60v19',2.2),
  ],
  butler: [
    shape('M12 63h76l-9 11H22Z',light),
    shape('M20 62q2-29 30-33 26 3 30 33Z'),
    ring(50,25,7,6,light),
    shape('M57 70h17l7 16-9-3-6 8Z',light),
    line('M26 56q5-17 23-20 M22 66h56 M64 76l5 8',2.5),
  ],
  drunk: [
    shape('M50 35q23-12 29 1 8 16-15 25l-5-8q17-8 12-14-4-6-19 4Z',light),
    shape('M14 56 47 24l20 12-9 28-20 15-11-5Z'),
    ring(43,38,19,6,ink,edge,3.2),
    shape('M74 57q14 8 12 17-1 8-10 7-9-1-7-11Z',light),
    cut('M23 60 33 71 M31 54l11 16 M43 50l8 12',3.1),
    line('M19 56l17-15 M76 68l-2 5',2.2),
  ],
  recluse: [
    ring(50,19,8,8,'none',edge,4),
    shape('M37 27h26l10 12H27Z',light),
    shape('M28 41h44v35l-5 9H33l-5-9Z',light),
    shape('M37 45h26v30H37Z',ink,'none'),
    shape('M50 51q-11 13-4 19 9 6 12-2 1-5-8-17Z',light,'none'),
    cut('M31 79h38',3),
    line('M34 45v30 M66 44v30',2),
  ],
  saint: [
    shape('M13 79h74v8H13Z',gold),
    shape('M19 57h13v22H19Z M43 40h14v39H43Z M68 57h13v22H68Z',light),
    shape('M25 36q12 15 1 17-12-2-1-17Z M50 12q16 20 0 23-15-3 0-23Z M75 36q11 15 0 17-11-2 0-17Z',light),
    cut('M24 66v10 M49 47v24 M74 65v10',2.6),
  ],
  poisoner: [
    shape('M43 14h14v14H43Z',ink),
    shape('M39 25h22v13l16 17 5 17-8 12H26l-8-12 5-17 16-17Z',light),
    shape('M25 60q20 5 49-7l5 18-8 10H29l-8-10Z','#654b39','none'),
    shape('M26 60q21 5 48-7','none',glint,3),
    cut('M40 32h20',3.2),
    ring(42,72,4,4,'none',edge,2),
    line('M28 54 38 43 M46 18h8',2.6),
  ],
  spy: [
    shape('M11 24q23-10 42 13 11-10 36-9l-5 38q-17 1-32 12-16-11-41-6Z',gold),
    shape('M12 17q24-8 42 16 17-13 34-11l-5 40q-17 1-31 11-19-13-40-9Z',light),
    cut('M54 35 52 70 M20 29q15-1 25 9 M20 41q13 0 24 8 M62 40q9-5 17-5 M61 50q7-4 16-5',3.1),
    shape('M65 66 66 88 73 80 79 85 75 63Z',ink,edge,2.2),
  ],
  scarlet_woman: [
    shape('M27 12q20 7 26 26 10 21 34 28l-4 19q-10-3-20 3-10-5-24-1-10-8-28-7 12-13 15-26 7-21 1-42Z',light),
    shape('M37 28q6 29 35 54-8-1-13 2-16-12-22-32-3 17-14 28l-9-1q16-17 17-48Z',red,'none'),
    shape('M52 53q11 18 31 19l-2 9q-11-2-16 1Z',red,'none'),
    ring(33,30,7,7,ink,glint,2.4),
    line('M36 14q9 6 15 22 M45 48q9 16 22 22',2.4),
  ],
  baron: [
    shape('M16 57q0-22 12-30 11-9 26-6 16 3 24 23h9v23H14Z'),
    shape('M28 43q6-14 20-14 14 0 21 14v10H28Z',ink,edge,2.5),
    shape('M46 30h4v23h-4Z M19 58h64v7H19Z',light,'none'),
    shape('M77 34h8v14h-8Z',light),
    ...[26,70].flatMap(x=>[
      ring(x,72,12,12,ink,edge,3.8),
      shape(`M${x - 6} 72h12 m-6-6v12`,'none',glint,2.4),
    ]),
  ],
  imp: [
    shape('M46 45q-16-16-35-19 5 13 4 34 6-5 14-2-1 5 1 11 7-6 15-6l5 13 5-13q8 0 15 6 2-6 1-11 8-3 14 2-1-21 4-34-19 3-35 19Z'),
    shape('M38 36 33 19q12 3 17 12 5-9 17-12l-5 17q8 8 5 16L50 70 33 52q-3-7 5-16Z',light),
    cut('M24 37 30 50 M76 37 70 50',2.9),
    shape('M40 43l7 2-4 4Z M60 43l-7 2 4 4Z',ink,'none'),
  ],
};

function drawing(paths) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 100 100">
    <defs>
      <linearGradient id="bronze" x2=".82" y2="1"><stop stop-color="#efcf92"/><stop offset=".55" stop-color="#bd9157"/><stop offset="1" stop-color="#865e3d"/></linearGradient>
      <linearGradient id="light" x2=".75" y2="1"><stop stop-color="#fae7b9"/><stop offset=".65" stop-color="#d1ab6e"/><stop offset="1" stop-color="#a87849"/></linearGradient>
    </defs>
    <g stroke-linecap="round" stroke-linejoin="round">${paths.join('')}</g>
  </svg>`);
}

export async function drawOriginals() {
  const folder = new URL('./originals/', import.meta.url);
  await mkdir(folder, { recursive:true });
  for (const [id,paths] of Object.entries(icons)) {
    await sharp(drawing(paths)).png().toFile(fileURLToPath(new URL(`${id}.png`, folder)));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await drawOriginals();
}
