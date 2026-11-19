import { distributionFor } from "@ravens/content";
import { Button, FeedbackButton } from "@ravens/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getRoomCreateAccess, readCreationIntent, verifyRoomCreatePasscode, type RoomPlayMode } from "../api.js";
import { ParticipationAudioChoice } from "../components/ParticipationAudioChoice.js";
import { PlayerProfileEditor } from "../components/PlayerProfileEditor.js";
import { OperationStatus, RoomPageShell } from "../components/RoomPage.js";
import { usePlayerProfile, type PlayerSelection } from "../use-player-profile.js";
import "../styles/six-player-rules.css";
import "../styles/create-room.css";

type AccessStatus = Awaited<ReturnType<typeof getRoomCreateAccess>>["status"];
type CreateProps = {
  onBack: () => void;
  onSubmit: (
    name: string,
    count: number,
    mode: RoomPlayMode,
    url?: string,
    profile?: PlayerSelection,
    sixPlayerEvilCooperation?: boolean,
  ) => void | Promise<"PASSCODE_REQUIRED" | void>;
  busy: boolean;
  error?: string;
};

export function Create({ onBack, onSubmit, busy, error }: CreateProps) {
  const saved = readCreationIntent();
  const profile = usePlayerProfile(saved ? {
    nickname: saved.organizerName,
    avatar: saved.avatar ?? null,
    ...(saved.expectedProfileRevision !== undefined ? { expectedProfileRevision: saved.expectedProfileRevision } : {}),
  } : undefined);
  const [count, setCount] = useState(saved?.playerCount ?? 8);
  const [cooperation, setCooperation] = useState(saved?.sixPlayerEvilCooperation === true);
  const [invalid, setInvalid] = useState("");
  const [access, setAccess] = useState<AccessStatus | "CHECKING" | "FAILED">("CHECKING");
  const [accessAttempt, setAccessAttempt] = useState(0);
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const mounted = useRef(false);
  const passcodeInput = useRef<HTMLInputElement>(null);
  const passcodePanel = useRef<HTMLDivElement>(null);
  const hasPendingCreation = Boolean(saved);
  const locked = busy || profile.saving || submitting;
  const accessLoading = !hasPendingCreation && access === "CHECKING";
  const needsPasscode = !hasPendingCreation && access === "PASSCODE_REQUIRED";
  const distribution = distributionFor(count);
  const roleCounts = [
    ["镇民", distribution.townsfolk],
    ["外来者", distribution.outsider],
    ["爪牙", distribution.minion],
    ["恶魔", distribution.demon],
  ] as const;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (hasPendingCreation) return;
    let active = true;
    void getRoomCreateAccess().then(
      ({ status }) => {
        if (active) setAccess(status);
      },
      () => {
        if (active) setAccess("FAILED");
      },
    );
    return () => { active = false; };
  }, [hasPendingCreation, accessAttempt]);

  useEffect(() => {
    if (passcodeError && needsPasscode) passcodePanel.current?.scrollIntoView?.({ block: "nearest" });
  }, [passcodeError, needsPasscode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitLock.current || locked || !profile.ready || accessLoading || (!saved && access === "FAILED")) return;
    setInvalid("");
    setPasscodeError("");
    if (needsPasscode && !passcode.trim()) {
      setPasscodeError("请输入收到的开房口令");
      passcodeInput.current?.focus();
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    try {
      if (needsPasscode) {
        try {
          const { status } = await verifyRoomCreatePasscode(passcode.trim());
          if (!mounted.current) return;
          setAccess(status);
          setPasscode("");
        } catch (caught) {
          if (mounted.current) setPasscodeError(caught instanceof Error ? caught.message : "暂时无法验证开房口令，请重试");
          return;
        }
      }
      const selected = saved ? profile.draft : await profile.save();
      if (!mounted.current) return;
      const result = await onSubmit(selected.nickname, count, saved?.playMode ?? "IN_PERSON",
        saved?.voiceRoomUrl, saved && !saved.creationVersion ? undefined : selected, count === 6 && cooperation);
      if (result === "PASSCODE_REQUIRED" && mounted.current) {
        setAccess("PASSCODE_REQUIRED");
        setPasscodeError(needsPasscode ? "浏览器未保存开房授权，请允许本站 Cookie 后重试" : "请输入收到的开房口令");
      }
    } catch (caught) {
      if (mounted.current) setInvalid(caught instanceof Error ? caught.message : "无法创建房间，请重试");
    } finally {
      submitLock.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  const accessFailed = !hasPendingCreation && access === "FAILED";
  const actionLabel = busy ? "正在创建房间…" : submitting ? needsPasscode ? "正在验证…" : "正在提交…" :
    accessLoading ? "正在确认开房资格…" : saved ? "继续创建房间" : "创建房间";

  return <RoomPageShell className="room-scene create-room" title="创建房间" onBack={onBack} actions={<>
    <OperationStatus error={invalid || profile.error || error} notice={profile.notice}/>
    {accessFailed ? <Button type="button" onClick={() => {
      setAccess("CHECKING");
      setAccessAttempt(attempt => attempt + 1);
    }}>重试检查开房资格</Button> :
      <Button form="create-room" type="submit" disabled={locked || !profile.ready || accessLoading}>{actionLabel}</Button>}
  </>}>
    <form id="create-room" className="room-form" onSubmit={submit}>
      <PlayerProfileEditor value={profile.draft} onChange={profile.change} guest={profile.account?.signedIn === false}
        defaultAvatar={profile.account?.profile?.defaultAvatar} disabled={locked || hasPendingCreation}/>
      {profile.error ? <FeedbackButton type="button" onClick={profile.reload}>重新载入资料</FeedbackButton> : null}
      <fieldset disabled={locked || hasPendingCreation}>
        <legend>玩家人数</legend>
        <div className="count-picker">{Array.from({ length: 8 }, (_, i) => i + 5).map(n =>
          <FeedbackButton type="button" key={n} aria-pressed={count === n} onClick={() => {
            setCount(n);
            if (n !== 6) setCooperation(false);
          }}>{n}人</FeedbackButton>)}</div>
        <div className="create-room__composition" aria-live="polite">
          <small>基础构成</small>
          <ul>{roleCounts.map(([label, value]) => <li key={label}><strong>{value}</strong> {label}</li>)}</ul>
        </div>
      </fieldset>
      {count === 6 ? <label className="six-player-rule">
        <input type="checkbox" aria-label="6人局邪恶协作" checked={cooperation} disabled={locked || hasPendingCreation}
          onChange={event => setCooperation(event.target.checked)}/>
        <span><strong>6人局邪恶协作 <small>自定义增强</small></strong><small>首夜相认 · 3个伪装 · 夜杀不变</small></span>
      </label> : null}
      {needsPasscode ? <div className="create-room__access" ref={passcodePanel}>
        <label htmlFor="room-create-passcode">开房口令</label>
        <input ref={passcodeInput} id="room-create-passcode" type="password" autoComplete="off" autoCapitalize="off" spellCheck={false}
          placeholder="输入收到的开房口令" value={passcode} maxLength={128} disabled={locked}
          aria-invalid={passcodeError ? true : undefined} aria-describedby="room-create-passcode-note"
          onChange={event => { setPasscode(event.target.value); setPasscodeError(""); }}/>
        <small id="room-create-passcode-note">{passcodeError ?
          <span role="alert">{passcodeError}</span> : "验证后，此浏览器会记住开房资格。"}</small>
      </div> : null}
      {!hasPendingCreation && access === "GRANTED" ?
        <p className="create-room__grant" role="status"><span aria-hidden="true">✓</span> 此浏览器已获开房资格</p> : null}
      {accessFailed ? <p className="operation-status" role="alert">暂时无法确认开房资格，请重试。</p> : null}
      <ParticipationAudioChoice/>
      {saved ? <p className="operation-status">继续确认原来的创建结果。</p> : null}
    </form>
  </RoomPageShell>;
}
