/** Equal radii in both axes: a short viewport must never turn a table into rows. */
export function roundTableLayout(count: number, diameter: number) {
  const offset = count === 7 ? Math.PI / 14 : count === 11 ? Math.PI / 22 : count === 12 ? Math.PI / 12 : 0;
  const unit = Array.from({length: count}, (_, i) => ({x: Math.sin(i * 2 * Math.PI / count + offset), y: -Math.cos(i * 2 * Math.PI / count + offset)}));
  let separation = 2;
  for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) separation = Math.min(separation, Math.max(Math.abs(unit[i]!.x - unit[j]!.x), Math.abs(unit[i]!.y - unit[j]!.y)));
  const minimum = Math.ceil(2 * 45 / separation + 52);
  const seatSize = Math.max(44, Math.min(64, Math.floor((separation * (diameter - 8) - 2) / (separation + 2))));
  const radius = Math.max(0, (diameter - seatSize - 8) / 2);
  return {diameter, minimum, seatSize, portrait: Math.min(42, seatSize - 14), points: unit.map(p => ({x: diameter / 2 + p.x * radius, y: diameter / 2 + p.y * radius}))};
}
