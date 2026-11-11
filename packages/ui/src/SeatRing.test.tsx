// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { SeatRing, type SeatView } from './SeatRing.js';

afterEach(cleanup);
const seats: SeatView[] = [
  { seat: 1, nickname: '甲', alive: true, connected: true, ghostVoteAvailable: true },
  { seat: 2, nickname: '乙', alive: true, connected: true, ghostVoteAvailable: true },
];

test('candidate rope is reversible and never changes a living player into a dead or disabled seat', () => {
  const select = vi.fn(), ui = render(<SeatRing seats={seats} threatenedSeats={[2]} onSelect={select} />);
  const candidate = screen.getByRole('button', { name: '2号 乙 存活，候选席' });
  expect(candidate).toBeEnabled();
  expect(candidate.querySelector('[data-avatar-state="THREATENED"]')).not.toBeNull();
  expect(candidate.querySelector('.rn-avatar-state--dead')).toBeNull();
  fireEvent.click(candidate);
  expect(select).toHaveBeenCalledWith(2, candidate);
  ui.rerender(<SeatRing seats={seats} threatenedSeats={[]} onSelect={select} />);
  expect(screen.getByRole('button', { name: '2号 乙 存活' }).querySelector('.rn-avatar-state')).toBeNull();
});

test('public death replaces candidate rope with a skull while retaining ghost-vote information and seat interaction', () => {
  const select = vi.fn(), ui = render(<SeatRing seats={seats} threatenedSeats={[2]} onSelect={select} />);
  expect(ui.container.querySelector('.rn-avatar-state--dead')).toBeNull();
  ui.rerender(<SeatRing seats={seats.map(seat => ({ ...seat, alive: seat.seat !== 2 }))} threatenedSeats={[2]} onSelect={select} />);
  const dead = screen.getByRole('button', { name: '2号 乙 已死亡' });
  expect(dead.querySelector('.rn-avatar-state--dead')).not.toBeNull();
  expect(dead.querySelector('.rn-avatar-state--threatened')).toBeNull();
  expect(dead.closest('li')).toHaveTextContent('鬼票尚在');
  expect(dead).toBeEnabled();
  fireEvent.click(dead);
  expect(select).toHaveBeenCalledWith(2, dead);
});

test('night target hints distinguish selected seats without blocking details on other seats', () => {
  const select = vi.fn();
  render(<SeatRing seats={seats} selectedSeats={[1]} selectableSeats={[1]} onSelect={select} />);
  const selected = screen.getByRole('button', { name: '1号 甲 存活' });
  const other = screen.getByRole('button', { name: '2号 乙 存活' });
  expect(selected).toHaveAttribute('aria-pressed', 'true');
  expect(other).toHaveAttribute('aria-pressed', 'false');
  expect(other).toBeEnabled();
  fireEvent.click(other);
  expect(select).toHaveBeenCalledWith(2, other);
});
