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
  const candidate = screen.getByRole('button', { name: '[乙] 存活，候选席' });
  expect(candidate).toBeEnabled();
  expect(candidate.querySelector('[data-avatar-state="THREATENED"]')).not.toBeNull();
  expect(candidate.querySelector('.rn-avatar-state--dead')).toBeNull();
  fireEvent.click(candidate);
  expect(select).toHaveBeenCalledWith(2, candidate);
  ui.rerender(<SeatRing seats={seats} threatenedSeats={[]} onSelect={select} />);
  expect(screen.getByRole('button', { name: '[乙] 存活' }).querySelector('.rn-avatar-state')).toBeNull();
});

test('public death replaces candidate rope with a skull while retaining ghost-vote information and seat interaction', () => {
  const select = vi.fn(), ui = render(<SeatRing seats={seats} threatenedSeats={[2]} onSelect={select} />);
  expect(ui.container.querySelector('.rn-avatar-state--dead')).toBeNull();
  ui.rerender(<SeatRing seats={seats.map(seat => ({ ...seat, alive: seat.seat !== 2 }))} threatenedSeats={[2]} onSelect={select} />);
  const dead = screen.getByRole('button', { name: '[乙] 已死亡' });
  expect(dead.querySelector('.rn-avatar-state--dead')).not.toBeNull();
  expect(dead.querySelector('.rn-avatar-state--threatened')).toBeNull();
  expect(dead.closest('li')).not.toHaveTextContent('鬼票尚在');
  expect(dead).toBeEnabled();
  fireEvent.click(dead);
  expect(select).toHaveBeenCalledWith(2, dead);
});

test('night target hints distinguish selected seats without blocking details on other seats', () => {
  const select = vi.fn();
  render(<SeatRing seats={seats} selectedSeats={[1]} selectableSeats={[1]} onSelect={select} />);
  const selected = screen.getByRole('button', { name: '[甲] 存活' });
  const other = screen.getByRole('button', { name: '[乙] 存活' });
  expect(selected).toHaveAttribute('aria-pressed', 'true');
  expect(other).toHaveAttribute('aria-pressed', 'false');
  expect(other).toBeEnabled();
  fireEvent.click(other);
  expect(select).toHaveBeenCalledWith(2, other);
});


test('public night death replaces the small skull with a scratch without changing seat identity',()=>{
 const dead=seats.map(s=>({...s,alive:false}));const ui=render(<SeatRing seats={dead} onSelect={vi.fn()}/>);
 expect(ui.container.querySelectorAll('.rn-avatar-state--dead')).toHaveLength(2);
 ui.rerender(<SeatRing seats={dead} nightDeathSeats={[2]} onSelect={vi.fn()}/>);
 const two=ui.container.querySelector('[data-seat-number="2"]')!;expect(two.querySelector('.rn-avatar-state--dead')).toBeNull();expect(two.querySelector('.rn-night-scratch')).not.toBeNull();expect(two.querySelector('.rn-seat__number')).toHaveTextContent(/^2$/);expect(two).not.toHaveTextContent('鬼票');
});
test('nomination, execution candidate, hand and locked vote retain independent public meanings',()=>{
 const ui=render(<SeatRing seats={seats} ownSeat={1} threatenedSeats={[2]} nominatorSeat={1} executionCandidate={{seat:1,votes:4}} raisedSeats={[2]} countedVotes={{1:true}}/>);
 const one=ui.container.querySelector('[data-seat-number="1"]')!,two=ui.container.querySelector('[data-seat-number="2"]')!;
 expect(one.querySelector('.rn-seat__number')).toHaveTextContent(/^1$/);expect(one.querySelector('[aria-label="提名人"]')).not.toBeNull();expect(one.querySelector('[aria-label="待处决候选，最高4票"]')).not.toBeNull();expect(one.querySelector('[aria-label="已锁票：赞成"]')).not.toBeNull();expect(one.querySelector('.rn-seat__hand')).toBeNull();expect(one.querySelector('.rn-avatar-state--threatened')).toBeNull();expect(two.querySelector('.rn-avatar-state--threatened')).not.toBeNull();expect(two.querySelector('.rn-seat__hand')).not.toBeNull();expect(two.querySelector('.rn-seat__ballot')).toBeNull();
});


test.each([5,7,12])('external number stays separate from portrait clipping and death overlays for %s seats',count=>{
 const players=Array.from({length:count},(_,i)=>({seat:i+1,nickname:'很长的玩家昵称'.repeat(4),avatar:'/face.webp',alive:i%3===0,connected:true}));
 const ui=render(<SeatRing fluid diameter={340} seats={players} threatenedSeats={[1]} nightDeathSeats={[2]} onSelect={vi.fn()}/>);
 for(const node of ui.container.querySelectorAll('.rn-seat')){
  const number=node.querySelector('.rn-seat__number')!,avatar=node.querySelector('.rn-seat__avatar')!;
  expect(avatar).not.toContainElement(number as HTMLElement);expect(number.parentElement).toHaveClass('rn-seat__portrait-anchor');expect(number.textContent).toBe(node.getAttribute('data-seat-number'));
 }
 expect(ui.container.querySelectorAll('.rn-night-scratch')).toHaveLength(1);expect(ui.container.querySelectorAll('.rn-avatar-state--dead').length).toBeGreaterThan(0);
});
