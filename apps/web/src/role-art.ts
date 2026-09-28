const PORTRAIT_ROLES = new Set([
  "washerwoman", "librarian", "investigator", "chef", "empath", "fortune_teller",
  "undertaker", "monk", "ravenkeeper", "virgin", "slayer", "soldier", "mayor",
  "butler", "drunk", "recluse", "saint", "poisoner", "spy", "scarlet_woman", "baron", "imp",
]);
const PORTRAIT_ROOT = "/assets/ravens/portraits-a-v1";
export function roleArt(roleId: string) {
  // Unknown identities must never fall back to another character's portrait.
  if (!PORTRAIT_ROLES.has(roleId)) return { portraitUrl: `${PORTRAIT_ROOT}/concealed.svg`, thumbnailUrl: `${PORTRAIT_ROOT}/concealed.svg`, portraitPosition: "50% 50%" };
  return {
    portraitUrl: `${PORTRAIT_ROOT}/${roleId}.webp`,
    thumbnailUrl: `${PORTRAIT_ROOT}/${roleId}-small.webp`,
    portraitSrcSet: `${PORTRAIT_ROOT}/${roleId}-small.webp 240w, ${PORTRAIT_ROOT}/${roleId}.webp 960w`,
    portraitPosition: "50% 50%",
  };
}
