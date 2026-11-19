/** Lamp regions are measured on the approved night town plate. */
export const nightWindowAtlas='/art/effects/v10/night-window-glass.webp';
export const nightWindowRegions=[
 {x:123,y:324,width:12,height:14,on:.15,rise:.14},
 {x:161,y:347,width:34,height:17,on:.27,rise:.18},
 {x:208,y:324,width:25,height:19,on:.22,rise:.19},
 {x:289,y:331,width:19,height:16,on:.35,rise:.16},
 {x:480,y:365,width:23,height:18,on:.31,rise:.22},
 {x:570,y:387,width:15,height:18,on:.49,rise:.18},
] as const;
export const nightWindowGrid={columns:3,tileWidth:36,tileHeight:22,width:108,height:44} as const;
