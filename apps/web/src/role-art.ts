const ROLE_ART_CELLS: Record<string, [number, number, number]> = {
  washerwoman:[1,0,0], librarian:[1,50,0], investigator:[1,100,0], chef:[1,0,100], empath:[1,50,100], fortune_teller:[1,100,100],
  undertaker:[2,0,0], monk:[2,50,0], ravenkeeper:[2,100,0], virgin:[2,0,100], slayer:[2,50,100], soldier:[2,100,100],
  mayor:[3,0,0], butler:[3,50,0], drunk:[3,100,0], recluse:[3,0,100], saint:[3,50,100], poisoner:[3,100,100],
  spy:[4,0,0], scarlet_woman:[4,50,0], baron:[4,100,0], imp:[4,0,100],
};

export function roleArt(roleId: string): { portraitUrl: string; portraitPosition: string } {
  const [sheet, x, y] = ROLE_ART_CELLS[roleId] ?? [1, 50, 50];
  return { portraitUrl: `/assets/role-sheet-${sheet}.webp`, portraitPosition: `${x}% ${y}%` };
}
