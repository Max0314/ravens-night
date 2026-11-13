import {smooth} from './cinematic-timing.js';

/** Measured on the unchanged v5 plate; bridge arches and the clock face are excluded. */
export const dawnTownPlate={url:'/art/effects/v5/dawn-town.webp',width:688,height:1024,sha256:'0c301dde1cb9682ab58080f8824a57bf36c1a695a212dba418246bbb40a42ce7'} as const;
export const dawnWindowRegions=[
 {x:253,y:270,width:7,height:8,sample:{x:256,y:273}},
 {x:180,y:288,width:10,height:20,sample:{x:182,y:304}},
 {x:558,y:289,width:20,height:10,sample:{x:567,y:294}},
 {x:481,y:291,width:6,height:7,sample:{x:483,y:295}},
 {x:93,y:303,width:7,height:7,sample:{x:96,y:305}},
 {x:166,y:317,width:5,height:9,sample:{x:168,y:319}},
 {x:239,y:316,width:10,height:14,sample:{x:245,y:319}},
 {x:258,y:325,width:25,height:9,sample:{x:279,y:330}},
 {x:323,y:329,width:5,height:6,sample:{x:325,y:332}},
 {x:122,y:333,width:8,height:9,sample:{x:126,y:337}},
 {x:198,y:342,width:28,height:9,sample:{x:222,y:346}},
 {x:32,y:354,width:6,height:7,sample:{x:35,y:357}},
 {x:642,y:324,width:6,height:6,sample:{x:645,y:327}},
 {x:492,y:368,width:18,height:12,sample:{x:499,y:375}},
 {x:576,y:390,width:22,height:16,sample:{x:595,y:401}},
] as const;

export function dawnArrivalPose(elapsedMs:number,durationMs:number,reduced=false){const d=Math.max(1,durationMs),t=Math.max(0,elapsedMs),warm=reduced?1:smooth(t,0,d*.88),fog=reduced?0:1-smooth(t,d*.12,d*.86);return{warm,fog,fogX:reduced?0:-18*(1-fog),fogY:reduced?0:-12*(1-fog),windowsOff:dawnWindowRegions.map((_,index)=>{const stagger=index/(dawnWindowRegions.length-1);return reduced?1:smooth(t,d*(.15+.42*stagger),d*(.28+.42*stagger));})};}
