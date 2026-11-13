import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {LayeredSceneArt} from './LayeredSceneArt.js';
import {empathDetailPose} from './role-detail-motion.js';

test('two jewel heartbeats follow the fixed four contacts and settle without reading the count',()=>{
 expect(empathDetailPose(650).left).toBe(1);expect(empathDetailPose(650).right).toBe(0);expect(empathDetailPose(820).left).toBeGreaterThan(.5);expect(empathDetailPose(1050).right).toBe(1);expect(empathDetailPose(1050).left).toBe(0);expect(empathDetailPose(1220).right).toBeGreaterThan(.5);expect(empathDetailPose(1850).left+empathDetailPose(1850).right).toBe(0);
 const render=(value:string)=>renderToStaticMarkup(<LayeredSceneArt role="empath" kind="INFORMATION" elapsedMs={1050} imprint={{label:'收到数字',value}}/>).replace(`>${value}</text>`,'>X</text>');expect(render('0')).toEqual(render('2'));
 const markup=renderToStaticMarkup(<LayeredSceneArt role="empath" kind="IDENTITY" elapsedMs={820}/>);expect(markup.match(/data-gem-side=/g)).toHaveLength(2);expect(markup.match(/<image /g)).toHaveLength(2);expect(markup).not.toContain('data-projection');
});
