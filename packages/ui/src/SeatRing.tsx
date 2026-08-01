export interface SeatView {
  seat: number;
  nickname: string;
  alive: boolean;
  connected: boolean;
}

export function SeatRing({ seats }: { seats: SeatView[] }) {
  return (
    <ol className="rn-seat-ring" style={{ "--seat-count": seats.length } as React.CSSProperties}>
      {seats.map((seat, index) => (
        <li
          key={seat.seat}
          className={`rn-seat ${seat.alive ? "" : "rn-seat--dead"} ${seat.connected ? "" : "rn-seat--offline"}`}
          style={{ "--seat-index": index } as React.CSSProperties}
        >
          <span className="rn-seat__number">{seat.seat}</span>
          <span className="rn-seat__name">{seat.nickname}</span>
        </li>
      ))}
    </ol>
  );
}
