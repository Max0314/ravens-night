import { canDealRole, compositionIssue, compositionKeys, distributionFor, isDefaultComposition } from '@ravens/content';
import type { BaseComposition, RoomKind } from '@ravens/contracts';
import { Button, FeedbackButton } from '@ravens/ui';
import { useRef, useState, type FormEvent } from 'react';
import { readCreationIntent, type RoomPlayMode } from '../api.js';
import { DetentWheel } from '../components/DetentWheel.js';
import { ParticipationAudioChoice } from '../components/ParticipationAudioChoice.js';
import { PlayerProfileEditor } from '../components/PlayerProfileEditor.js';
import { OperationStatus, RoomPageShell } from '../components/RoomPage.js';
import { usePlayerProfile, type PlayerSelection } from '../use-player-profile.js';
import '../styles/six-player-rules.css';
import '../styles/create-room.css';

export type CreateOptions = { kind: RoomKind; baseComposition?: BaseComposition };
type CreateProps = {
  onBack: () => void;
  onSubmit: (name: string, count: number, mode: RoomPlayMode, url?: string, profile?: PlayerSelection, cooperation?: boolean, options?: CreateOptions) => void | Promise<void>;
  kind?: RoomKind;
  allowCustom?:boolean;
  busy: boolean;
  error?: string;
};
const categories = {
  townsfolk: { label: '镇民', max: 12, path: 'M3 11 12 4l9 7v9H3z M10 20v-6h4v6' },
  outsider: { label: '外来者', max: 4, path: 'M4 20C5 11 10 5 20 4c0 9-5 14-13 13 M4 20l10-9' },
  minion: { label: '爪牙', max: 2, path: 'M12 21V9 M12 12C6 12 4 8 4 5c4 0 7 2 8 4 1-2 4-4 8-4 0 3-2 7-8 7 M8 17h8' },
  demon: { label: '恶魔', max: 1, path: 'M5 14C2 10 2 6 3 4c3 1 5 3 6 6h6c1-3 3-5 6-6 1 2 1 6-2 10l-7 7z' },
} as const;

export function Create({ onBack, onSubmit, kind = 'STANDARD', allowCustom=true, busy, error }: CreateProps) {
  const saved = readCreationIntent();
  const frozen = saved ? {
    nickname:saved.organizerName,avatar:saved.avatar??null,
    ...(saved.expectedProfileRevision===undefined?{}:{expectedProfileRevision:saved.expectedProfileRevision}),
  } : undefined;
  const profile = usePlayerProfile(frozen);
  const [draftCount, setCount] = useState(saved?.playerCount ?? 7);
  const [drafts, setDrafts] = useState<Partial<Record<number, BaseComposition>>>(saved?.baseComposition ? { [saved.playerCount]: saved.baseComposition } : {});
  const [cooperationDraft, setCooperation] = useState(saved?.sixPlayerEvilCooperation === true);
  const [preview, setPreview] = useState<{ key: keyof BaseComposition; value: number }>();
  const [invalid, setInvalid] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const locked = busy || submitting || profile.saving;
  const count = saved?.playerCount??draftCount;
  const cooperation = saved?saved.sixPlayerEvilCooperation===true:cooperationDraft;
  const mode = saved?.roomKind ?? kind;
  const composition = (saved?saved.baseComposition:drafts[count]) ?? distributionFor(count);
  const current = preview ? { ...composition, [preview.key]:preview.value } : composition;
  const assigned = compositionKeys.reduce((sum,key) => sum+current[key],0);
  const issue = compositionIssue(count, current);
  const useStandard = isDefaultComposition(count, composition);
  const notice = assigned !== count ? assigned < count ? `还缺 ${count-assigned} 人` : `多了 ${assigned-count} 人` : issue === 'NO_LEGAL_DEAL' ? '这个构成无法发牌' : issue ? '至少 1 镇民、1 爪牙及 1 恶魔' : !canDealRole(count, 'baron', current) ? '当前构成不会抽到男爵' : '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || locked || !saved&&!profile.ready || issue || preview) return;
    inFlight.current = true;
    setSubmitting(true);
    setInvalid('');
    try {
      const selected = frozen ?? await profile.save();
      await onSubmit(selected.nickname,count,saved?.playMode??'IN_PERSON',saved?.voiceRoomUrl,
        saved&&saved.avatar===undefined?undefined:selected,count===6&&cooperation,{kind:mode,...(!useStandard?{baseComposition:composition}:{})});
    } catch (caught) {
      setInvalid(caught instanceof Error ? caught.message : '无法创建房间，请重试');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return <RoomPageShell className="room-scene create-room" title="创建房间" subtitle={mode==='DEBUG_SOLO'?'单人调试':undefined} onBack={onBack} actions={<>
    <OperationStatus error={invalid||profile.error||error} notice={profile.notice}/>
    <Button form="create-room" type="submit" disabled={locked||!saved&&!profile.ready||Boolean(issue)||Boolean(preview)}>{locked?'正在创建房间…':saved?'重试原开房操作':'创建房间'}</Button>
  </>}>
    <form id="create-room" className="room-form" onSubmit={submit}>
      <PlayerProfileEditor value={frozen??profile.draft} onChange={profile.change} guest={profile.account?.signedIn===false}
        defaultAvatar={profile.account?.profile?.defaultAvatar} disabled={locked||Boolean(saved)}/>
      {(profile.error||error?.includes('资料已更新')) && !saved && <FeedbackButton type="button" onClick={profile.reload}>重新载入资料</FeedbackButton>}
      <fieldset disabled={locked||Boolean(saved)} className="create-room__setup">
        <legend>玩家人数</legend>
        <DetentWheel value={count} min={5} max={12} label="玩家人数" disabled={locked||Boolean(saved)} onChange={value=>{setCount(value);if(value!==6)setCooperation(false);}}/>
        <section className="create-room__composition" aria-label="基础构成">
          <header><strong>基础构成</strong>{allowCustom&&<button type="button" disabled={useStandard} onClick={()=>setDrafts(previous=>({...previous,[count]:distributionFor(count)}))}>恢复默认</button>}</header>
          <div className="create-room__slots">{compositionKeys.map(key=>{
            const item=categories[key];
            return <div className="create-room__slot" key={`${count}:${key}`}>
              <span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={item.path}/></svg>{item.label}</span>
              {allowCustom?<DetentWheel vertical label={`${item.label}人数`} min={0} max={Math.min(count,item.max)} value={composition[key]} disabled={locked||Boolean(saved)}
                onPreview={value=>setPreview(value===undefined?undefined:{key,value})}
                onChange={value=>setDrafts(previous=>({...previous,[count]:{...(previous[count]??distributionFor(count)),[key]:value}}))}/>:<strong>{composition[key]}</strong>}
            </div>;
          })}</div>
          <p className={issue?'is-invalid':''} role="status"><span>已配 {assigned}/{count} 人</span><span>{notice}</span></p>
        </section>
      </fieldset>
      {!allowCustom&&<p role="status">服务更新中，刷新后可调整基础构成。</p>}
      {count===6 && <label className="six-player-rule"><input type="checkbox" aria-label="6人局邪恶协作" checked={cooperation} disabled={locked||Boolean(saved)} onChange={event=>setCooperation(event.target.checked)}/><span><strong>6人局邪恶协作 <small>自定义增强</small></strong><small>首夜相认 · 3个伪装</small></span></label>}
      <ParticipationAudioChoice/>
    </form>
  </RoomPageShell>;
}
