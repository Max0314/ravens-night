export interface SeatView {
  avatar?: string | undefined;
  seat: number;
  nickname: string;
  alive: boolean;
  connected: boolean;
  ghostVoteAvailable?: boolean;
}

export function SeatRing({ seats, onSelect, ownSeat, activeSeat, countedVotes, raisedSeats, privateMarks }: { seats: SeatView[]; onSelect?: (seat: number, anchor?:HTMLElement) => void; ownSeat?: number; activeSeat?: number; countedVotes?: Record<number, boolean>; raisedSeats?: number[];privateMarks?:Record<number,string> }) {
  return (
    <ol className="rn-seat-ring" style={{ "--seat-count": seats.length } as React.CSSProperties}>
      {seats.map((seat, index) => (
        <li
          key={seat.seat}
          data-seat-number={seat.seat}
          className={`rn-seat ${seat.alive ? "" : "rn-seat--dead"} ${seat.connected ? "" : "rn-seat--offline"} ${seat.seat === ownSeat ? "rn-seat--mine" : ""} ${seat.seat === activeSeat ? "rn-seat--counting" : ""} ${countedVotes?.[seat.seat] === true ? "rn-seat--raised" : ""}`}
          style={{ "--seat-index": index } as React.CSSProperties}
        >
          {onSelect ? <button type="button" onClick={e => onSelect(seat.seat,e.currentTarget)} aria-label={`${seat.seat}号 ${seat.nickname} ${seat.alive ? "存活" : "已死亡"}${seat.seat === ownSeat ? "，你" : ""}`}><span className="rn-seat__avatar">{seat.avatar?<img key={seat.avatar} src={seat.avatar} alt="" draggable={false} onError={e=>{e.currentTarget.hidden=true;}}/>:null}<span aria-hidden="true">{[...seat.nickname][0]??"客"}</span></span><span className="rn-seat__number">{seat.seat}{seat.seat === ownSeat ? " · 你" : ""}</span><span className="rn-seat__name">{seat.nickname}</span></button> : <><span className="rn-seat__avatar">{seat.avatar?<img key={seat.avatar} src={seat.avatar} alt="" draggable={false} onError={e=>{e.currentTarget.hidden=true;}}/>:null}<span aria-hidden="true">{[...seat.nickname][0]??"客"}</span></span><span className="rn-seat__number">{seat.seat}</span><span className="rn-seat__name">{seat.nickname}</span></>}
          {privateMarks?.[seat.seat]?<span className="rn-seat__private-mark" aria-label={`我的线索：${privateMarks[seat.seat]}`}>{privateMarks[seat.seat]}</span>:null}
          {!seat.alive ? <small className="rn-seat__ghost">{seat.ghostVoteAvailable ? "◈ 鬼票尚在" : "鬼票已用"}</small> : null}
          {countedVotes?.[seat.seat] !== undefined ? <small className="rn-seat__ballot">{countedVotes[seat.seat] ? "举手 · 已计票" : "未举手 · 已计票"}</small> : null}
          {raisedSeats?.includes(seat.seat) ? <span className="rn-seat__hand" aria-label="已举手">✋</span> : null}
        </li>
      ))}
    </ol>
  );
}
