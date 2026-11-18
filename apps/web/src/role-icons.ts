import {beginnerRoles} from '@ravens/content';

const knownRoleIds=new Set(beginnerRoles.map(role=>role.id));

export function roleIconUrl(roleId:string){
  return knownRoleIds.has(roleId)?`/assets/ravens/role-icons-v1/${roleId}.webp`:undefined;
}
