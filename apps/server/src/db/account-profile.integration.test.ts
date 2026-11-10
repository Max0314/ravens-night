import {randomUUID} from 'node:crypto';
import {expect,test} from 'vitest';
import {Pool} from 'pg';
import {PostgresRoomRepository} from './room-repository.js';
import {LiveRoomRuntime} from '../game/live-runtime.js';

test.skipIf(!process.env.TEST_DATABASE_URL)('game-only profiles migrate additively, persist encrypted, and roll back atomically with lobby changes',async()=>{
  const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL!}),schema='profile_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA "${schema}"`);
  const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema);
  const open=()=>new LiveRoomRuntime(new PostgresRoomRepository(url.toString(),'profile-test-key'),{presentation:false});let runtime=open();
  const account={sub:'test-profile-owner',name:'默认玩家'};
  try{
    await runtime.initialize();const room=await runtime.execute(s=>s.create(5,'房主'));
    const joined=await runtime.execute(s=>{const player=s.join(room.room.code,'旧昵称','PLAYER');s.bindAccount(room.room.code,player.token,account.sub,player.token);return player;});
    await runtime.execute(s=>s.updateAccountProfile(account,'私有游戏昵称',null,0));
    const encoded=(await admin.query(`SELECT profile FROM "${schema}".room_account_profiles`)).rows[0].profile;
    expect(encoded.format).toBe('ravens-aes256-v1');expect(JSON.stringify(encoded)).not.toContain('私有游戏昵称');
    await admin.query(`ALTER TABLE "${schema}".room_account_profiles ADD CONSTRAINT reject_update CHECK(revision<2)`);
    await expect(runtime.execute(s=>s.updateAccountProfile(account,'失败修改',null,1))).rejects.toThrow('暂时无法保存');
    expect(runtime.service.privateView(room.room.code,joined.token).participant.nickname).toBe('私有游戏昵称');
    expect((await admin.query(`SELECT revision FROM "${schema}".room_account_profiles`)).rows[0].revision).toBe(1);
    await runtime.close();runtime=open();await runtime.initialize();
    expect(runtime.service.accountProfile(account.sub)?.nickname).toBe('私有游戏昵称');expect(runtime.service.privateView(room.room.code,joined.token).participant.nickname).toBe('私有游戏昵称');
    await admin.query(`ALTER TABLE "${schema}".room_account_profiles DROP CONSTRAINT reject_update`);
    await runtime.execute(s=>s.updateAccountProfile(account,null,null,1));expect(runtime.service.privateView(room.room.code,joined.token).participant.nickname).toBe('默认玩家');
  }finally{await runtime.close();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
},30000);
