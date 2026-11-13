import {beginnerRoles} from '@ravens/content';

interface FrameArt {frameUrl?:string;frameThumbnailUrl?:string;frameSrcSet?:string}
interface RoleArt extends FrameArt {portraitUrl:string;thumbnailUrl:string;portraitSrcSet?:string;portraitPosition:string}
const FRAME_ROOT='/assets/ravens/role-type-frames-v1';
const PUBLIC_ROLE_TYPES=new Map(beginnerRoles.map(role=>[role.id,role.type]));
export function roleFrame(type:string):FrameArt{
  if(!['TOWNSFOLK','OUTSIDER','MINION','DEMON'].includes(type))return {};
  const id=type.toLowerCase();
  return {frameUrl:`${FRAME_ROOT}/${id}.webp`,frameThumbnailUrl:`${FRAME_ROOT}/${id}-small.webp`,frameSrcSet:`${FRAME_ROOT}/${id}-small.webp 240w, ${FRAME_ROOT}/${id}.webp 960w`};
}

const PORTRAIT_ROLES = new Set([
  "washerwoman", "librarian", "investigator", "chef", "empath", "fortune_teller",
  "undertaker", "monk", "ravenkeeper", "virgin", "slayer", "soldier", "mayor",
  "butler", "drunk", "recluse", "saint", "poisoner", "spy", "scarlet_woman", "baron", "imp",
]);
const PORTRAIT_ROOT = "/assets/ravens/portraits-b-v2";
const REVISED_ROLES = new Set(["spy", "virgin"]);
export function roleArt(roleId: string):RoleArt {
  // Unknown identities must never fall back to another character's portrait.
  if (!PORTRAIT_ROLES.has(roleId)) return { portraitUrl: `${PORTRAIT_ROOT}/concealed.svg`, thumbnailUrl: `${PORTRAIT_ROOT}/concealed.svg`, portraitPosition: "50% 50%" };
  const root = roleId === "undertaker" || roleId === "monk" ? "/assets/ravens/portraits-b-v4" : REVISED_ROLES.has(roleId) ? "/assets/ravens/portraits-b-v3" : PORTRAIT_ROOT;
  const assetId = roleId === "poisoner" || roleId === "scarlet_woman" ? `${roleId}-approved-20261112` : roleId;
  return {
    ...roleFrame(PUBLIC_ROLE_TYPES.get(roleId)??''),
    portraitUrl: `${root}/${assetId}.webp`,
    thumbnailUrl: `${root}/${assetId}-small.webp`,
    portraitSrcSet: `${root}/${assetId}-small.webp 240w, ${root}/${assetId}.webp 960w`,
    portraitPosition: "50% 20%",
  };
}
