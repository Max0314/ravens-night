import type {PrivateSceneDescriptor} from '@ravens/contracts';
/** Four-second accompaniment, separate from material contacts. No full song is decoded. */
export function roleMusicCues(scene:PrivateSceneDescriptor):Array<[number,string,number,'continuous']>{
 if(scene.themeRoleId==='fortune_teller'&&scene.kind==='ACTION_SUBMITTED'&&scene.shown.type==='TARGET_SUBMITTED'&&scene.shown.action==='DIVINE')return[[0,'score:M22',.5,'continuous']];
 if(scene.kind!=='IDENTITY'&&scene.kind!=='INFORMATION')return[];
 if(scene.themeRoleId==='fortune_teller')return[[0,'score:M22',.5,'continuous']];
 return ['washerwoman','chef','investigator','librarian','empath','undertaker','ravenkeeper'].includes(scene.themeRoleId)?[[0,'score:M03',.5,'continuous']]:[];
}
