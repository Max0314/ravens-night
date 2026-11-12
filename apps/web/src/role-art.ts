const PORTRAIT_ROLES = new Set([
  "washerwoman", "librarian", "investigator", "chef", "empath", "fortune_teller",
  "undertaker", "monk", "ravenkeeper", "virgin", "slayer", "soldier", "mayor",
  "butler", "drunk", "recluse", "saint", "poisoner", "spy", "scarlet_woman", "baron", "imp",
]);
const PORTRAIT_ROOT = "/assets/ravens/portraits-b-v2";
const REVISED_ROLES = new Set(["spy", "virgin"]);
export function roleArt(roleId: string) {
  // Unknown identities must never fall back to another character's portrait.
  if (!PORTRAIT_ROLES.has(roleId)) return { portraitUrl: `${PORTRAIT_ROOT}/concealed.svg`, thumbnailUrl: `${PORTRAIT_ROOT}/concealed.svg`, portraitPosition: "50% 50%" };
  const root = REVISED_ROLES.has(roleId) ? "/assets/ravens/portraits-b-v3" : PORTRAIT_ROOT;
  return {
    portraitUrl: `${root}/${roleId}.webp`,
    thumbnailUrl: `${root}/${roleId}-small.webp`,
    portraitSrcSet: `${root}/${roleId}-small.webp 240w, ${root}/${roleId}.webp 960w`,
    portraitPosition: "50% 20%",
  };
}
