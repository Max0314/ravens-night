import {FeedbackButton} from './FeedbackButton.js';
import {playerLabel} from './player-label.js';
import {useMemo,type CSSProperties} from "react";
import {roundTableLayout} from './round-table.js';
import './styles/seat-ring.css';
import {layoutSeatMarkers} from './seat-marker-layout.js';
export {layoutSeatMarkers,markerOverlap} from './seat-marker-layout.js';

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
  if(state==='THREATENED')return <img className="rn-avatar-state rn-avatar-state--threatened rn-avatar-cage" src="/art/effects/v7/nomination-cage-small.webp" alt="" aria-hidden="true" draggable={false}/>;
  return <svg className="rn-avatar-state rn-avatar-state--dead" viewBox="14 28 20 20" aria-hidden="true" focusable="false" fill="none"><path className="rn-avatar-state__skull" d="M24 30c-5 0-8 3-8 7 0 3 2 5 5 6v3h6v-3c3-1 5-3 5-6 0-4-3-7-8-7Z"/><path className="rn-avatar-state__features" d="M20 36h1m6 0h1m-5 5h2m-3 2v3m4-3v3"/></svg>;
}

interface SeatRingProps {
  seats: SeatView[];
  onSelect?: (seat: number, anchor?: HTMLElement) => void;
  ownSeat?: number;
  activeSeat?: number;
  countedVotes?: Record<number, boolean>;
  raisedSeats?: number[];
  privateMarks?: Record<number,string>;
  onPrivateMark?:(seat:number)=>void;
  fluid?: boolean;
  diameter?: number;
  threatenedSeats?: number[];
  nightDeathSeats?: number[];
  nominatorSeat?: number | undefined;
  executionCandidate?: {seat:number;votes:number} | undefined;
  selectedSeats?: number[];
  selectableSeats?: number[];
}

export function SeatRing({ seats, onSelect, ownSeat, activeSeat, countedVotes, raisedSeats, privateMarks, onPrivateMark, fluid=false, diameter=320, threatenedSeats, nightDeathSeats, nominatorSeat, executionCandidate, selectedSeats, selectableSeats }: SeatRingProps) {
  const layout=roundTableLayout(seats.length,diameter);
  const markerSeats=seats.map(p=>({seat:p.seat,caged:threatenedSeats?.includes(p.seat)||executionCandidate?.seat===p.seat,execution:executionCandidate?.seat===p.seat}));
  const markerPositions=useMemo(()=>layoutSeatMarkers(layout,markerSeats,privateMarks??{}),[diameter,JSON.stringify(markerSeats),JSON.stringify(privateMarks)]);
  return <ol className={`rn-seat-ring${fluid?" rn-seat-ring--fluid":""}`} style={{ "--seat-count": seats.length } as CSSProperties}>
    {seats.map((seat, index) => {
      const caged=threatenedSeats?.includes(seat.seat)||executionCandidate?.seat===seat.seat;
      const state = !seat.alive ? "DEAD" : caged ? "THREATENED" : undefined;
      const mark=markerPositions.find(m=>m.seat===seat.seat),point=layout.points[index]!;
      const selected = selectedSeats?.includes(seat.seat);
      const selectable = selectableSeats?.includes(seat.seat);
      const avatar = <span className="rn-seat__avatar" data-avatar-state={state}>
        {seat.avatar ? <img key={seat.avatar} src={seat.avatar} alt="" draggable={false} onError={event => { event.currentTarget.hidden = true; }} /> : null}
        <span className="rn-seat__initial" aria-hidden="true">{[...seat.nickname][0] ?? "客"}</span>
        {state==='DEAD'&&!nightDeathSeats?.includes(seat.seat)?<SeatAvatarDecoration state="DEAD"/>:null}{caged?<SeatAvatarDecoration state="THREATENED"/>:null}
        {state==='DEAD'&&nightDeathSeats?.includes(seat.seat)?<img className="rn-night-scratch" src="/art/effects/v3/claw-town.webp" alt="" draggable={false}/>:null}
      </span>;
      const portrait=<span className="rn-seat__portrait-anchor">{avatar}<span className="rn-seat__number">{seat.seat}</span></span>;
      return <li key={seat.seat} data-seat-number={seat.seat}
        className={`rn-seat ${state === "DEAD" ? "rn-seat--dead" : state === "THREATENED" ? "rn-seat--threatened" : ""} ${caged?"rn-seat--caged":""} ${seat.connected ? "" : "rn-seat--offline"} ${seat.seat === ownSeat ? "rn-seat--mine" : ""} ${seat.seat === activeSeat ? "rn-seat--counting" : ""} ${countedVotes?.[seat.seat] !== undefined ? "rn-seat--locked" : ""} ${selected ? "rn-seat--selected" : ""} ${selectable ? "rn-seat--selectable" : ""}`}
        style={{ "--seat-index": index,...(fluid?{left:layout.points[index]!.x,top:layout.points[index]!.y}:{}) } as CSSProperties}>
        {onSelect ? <FeedbackButton type="button" onClick={event => onSelect(seat.seat, event.currentTarget)} aria-pressed={selected} aria-label={`${playerLabel(seat.seat,seat.nickname)} ${seat.alive ? "存活" : "已死亡"}${seat.seat === ownSeat ? "，你" : ""}${caged ? "，候选席" : ""}`}>
          {portrait}<span className="rn-seat__name">{seat.nickname}</span>
        </FeedbackButton> : <>{portrait}<span className="rn-seat__name">{seat.nickname}</span></>}
        {mark&&privateMarks?.[seat.seat]?<FeedbackButton type="button" className="rn-seat__private-mark rn-seat__private-mark--placed" feedbackScope="private" title={privateMarks[seat.seat]} aria-label={`我的线索：${privateMarks[seat.seat]}`} onClick={()=>onPrivateMark?.(seat.seat)} style={{left:mark.x-point.x+layout.seatSize/2,top:mark.y-point.y+layout.seatSize/2,width:mark.width,height:mark.height}}>{mark.lines.map((line,i)=><span key={i}>{line}</span>)}</FeedbackButton>:null}
        {countedVotes?.[seat.seat] !== undefined ? <small className="rn-seat__ballot" aria-label={`已锁票：${countedVotes[seat.seat]?"赞成":"未举手"}`}>✓</small> : null}
        {seat.seat===nominatorSeat?<span className="rn-seat__nomination" aria-label="提名人">☞</span>:null}
        {executionCandidate?.seat===seat.seat?<span className="rn-seat__execution" aria-label={`待处决候选，最高${executionCandidate.votes}票`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 22h20M7 22V3h12M7 9l6-6M19 3v8m0 0c-4 0-4 7 0 7s4-7 0-7" fill="none"/></svg><span>{executionCandidate.votes}</span></span>:null}
        {raisedSeats?.includes(seat.seat) ? <span className="rn-seat__hand" aria-label="已举手">✋</span> : null}
      </li>;
    })}
  </ol>;
}
