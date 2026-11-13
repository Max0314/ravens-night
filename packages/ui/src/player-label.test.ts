import {expect,test} from 'vitest';
import {formatPlayerText,playerLabel} from './player-label.js';
test('legacy complete labels become readable nicknames without rewriting other historical content',()=>{
 const stored='【玩家12-阿-青】提名【玩家2-乙】，seat=12；【玩家3-未完；角色线索保持原文。';
 expect(formatPlayerText(stored)).toBe('[阿-青]提名[乙]，seat=12；【玩家3-未完；角色线索保持原文。');
 expect(stored).toContain('【玩家12-阿-青】');expect(formatPlayerText('【玩家-未知】与【玩家2-】')).toBe('【玩家-未知】与【玩家2-】');
 expect(playerLabel(12,'阿-青')).toBe('[阿-青]');
});
