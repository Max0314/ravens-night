import {FeedbackButton} from './FeedbackButton.js';
import {playerLabel} from './player-label.js';
import type { CSSProperties } from "react";
import {roundTableLayout} from './round-table.js';

export interface SeatView {
  avatar?: string | undefined;
  seat: number;
  nickname: string;
  alive: boolean;
  connected: boolean;
  ghostVoteAvailable?: boolean;
}

/** Decorations express public life/candidate state only; they never change action eligibility. */
export function SeatAvatarDecoration({ state }: { state: "THREATENED" | "DEAD" }) {
  return <svg className={`rn-avatar-state rn-avatar-state--${state.toLowerCase()}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false" fill="none">
    {state === "DEAD" ? <>
      <circle cx="24" cy="24" r="22" />
      <path d="M8 15 5 12m35 3 3-3M4 26H1m43 0h3M10 38l-3 3m31-3 3 3" />
      <path className="rn-avatar-state__skull" d="M24 30c-5 0-8 3-8 7 0 3 2 5 5 6v3h6v-3c3-1 5-3 5-6 0-4-3-7-8-7Z" />
      <path className="rn-avatar-state__features" d="M20 36h1m6 0h1m-5 5h2m-3 2v3m4-3v3" />
    </> : <>
      <circle cx="24" cy="24" r="21.5" />
      <path d="M4 32c12 4 28 4 40 0M6 36c12 4 24 4 36 0M11 5 8 34m29-29 3 29" />
      <path d="m38 30 5 7m-5 0 5-7m-3 6-3 7m5-7 2 6" />
    </>}
  </svg>;
}

interface SeatRingProps {
  seats: SeatView[];
  onSelect?: (seat: number, anchor?: HTMLElement) => void;
  ownSeat?: number;
  activeSeat?: number;
  countedVotes?: Record<number, boolean>;
  raisedSeats?: number[];
  privateMarks?: Record<number, string>;
  onPrivateMark?: (seat:number)=>void;
  fluid?: boolean;
  diameter?: number;
  threatenedSeats?: number[];
  nightDeathSeats?: number[];
  selectedSeats?: number[];
  selectableSeats?: number[];
}

export function SeatRing({ seats, onSelect, ownSeat, activeSeat, countedVotes, raisedSeats, privateMarks, onPrivateMark, fluid=false, diameter=320, threatenedSeats, nightDeathSeats, selectedSeats, selectableSeats }: SeatRingProps) {
  const layout=roundTableLayout(seats.length,diameter);
  return <ol className={`rn-seat-ring${fluid?" rn-seat-ring--fluid":""}`} style={{ "--seat-count": seats.length } as CSSProperties}>
    {seats.map((seat, index) => {
      const state = !seat.alive ? "DEAD" : threatenedSeats?.includes(seat.seat) ? "THREATENED" : undefined;
      const selected = selectedSeats?.includes(seat.seat);
      const selectable = selectableSeats?.includes(seat.seat);
      const avatar = <span className="rn-seat__avatar" data-avatar-state={state}>
        {seat.avatar ? <img key={seat.avatar} src={seat.avatar} alt="" draggable={false} onError={event => { event.currentTarget.hidden = true; }} /> : null}
        <span className="rn-seat__initial" aria-hidden="true">{[...seat.nickname][0] ?? "客"}</span>
        {state ? <SeatAvatarDecoration state={state} /> : null}
        {state==='DEAD'&&nightDeathSeats?.includes(seat.seat)?<img className="rn-night-scratch" src="/art/effects/v3/claw-town.webp" alt="" draggable={false}/>:null}
      </span>;
      return <li key={seat.seat} data-seat-number={seat.seat}
        className={`rn-seat ${state === "DEAD" ? "rn-seat--dead" : state === "THREATENED" ? "rn-seat--threatened" : ""} ${seat.connected ? "" : "rn-seat--offline"} ${seat.seat === ownSeat ? "rn-seat--mine" : ""} ${seat.seat === activeSeat ? "rn-seat--counting" : ""} ${countedVotes?.[seat.seat] === true ? "rn-seat--raised" : ""} ${selected ? "rn-seat--selected" : ""} ${selectable ? "rn-seat--selectable" : ""}`}
        style={{ "--seat-index": index,...(fluid?{left:layout.points[index]!.x,top:layout.points[index]!.y}:{}) } as CSSProperties}>
        {onSelect ? <FeedbackButton type="button" onClick={event => onSelect(seat.seat, event.currentTarget)} aria-pressed={selected} aria-label={`${playerLabel(seat.seat,seat.nickname)} ${seat.alive ? "存活" : "已死亡"}${seat.seat === ownSeat ? "，你" : ""}${state === "THREATENED" ? "，候选席" : ""}`}>
          {avatar}<span className="rn-seat__number">{seat.seat}{seat.seat === ownSeat ? " · 你" : ""}</span><span className="rn-seat__name">{seat.nickname}</span>
        </FeedbackButton> : <>{avatar}<span className="rn-seat__number">{seat.seat}</span><span className="rn-seat__name">{seat.nickname}</span></>}
        {privateMarks?.[seat.seat] ? onPrivateMark?<FeedbackButton type="button" className="rn-seat__private-mark" title={privateMarks[seat.seat]} aria-label={`我的线索：${privateMarks[seat.seat]}`} onClick={()=>onPrivateMark?.(seat.seat)}>{privateMarks[seat.seat]}</FeedbackButton>:<span className="rn-seat__private-mark" title={privateMarks[seat.seat]} aria-label={`我的线索：${privateMarks[seat.seat]}`}>{privateMarks[seat.seat]}</span> : null}
        {!seat.alive ? <small className="rn-seat__ghost">{seat.ghostVoteAvailable ? "◈ 鬼票尚在" : "鬼票已用"}</small> : null}
        {countedVotes?.[seat.seat] !== undefined ? <small className="rn-seat__ballot">{countedVotes[seat.seat] ? "举手 · 已计票" : "未举手 · 已计票"}</small> : null}
        {raisedSeats?.includes(seat.seat) ? <span className="rn-seat__hand" aria-label="已举手">✋</span> : null}
      </li>;
    })}
  </ol>;
}
