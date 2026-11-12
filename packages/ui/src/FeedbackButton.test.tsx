// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {FeedbackButton} from './FeedbackButton.js';
afterEach(cleanup);
test('a pointer gesture emits once on accepted click, disabled and cancelled commands emit nothing',()=>{const feedback=vi.fn();window.addEventListener('ravens:ui-feedback',feedback);const ui=render(<FeedbackButton>动作</FeedbackButton>);const button=screen.getByRole('button');fireEvent.pointerDown(button);expect(feedback).not.toHaveBeenCalled();fireEvent.click(button);expect(feedback).toHaveBeenCalledTimes(1);ui.rerender(<FeedbackButton disabled>动作</FeedbackButton>);fireEvent.click(button);expect(feedback).toHaveBeenCalledTimes(1);ui.rerender(<FeedbackButton onClick={e=>e.preventDefault()}>动作</FeedbackButton>);fireEvent.click(button);expect(feedback).toHaveBeenCalledTimes(1);window.removeEventListener('ravens:ui-feedback',feedback);});

test('night controls explicitly inherit private scope before the click changes their DOM',()=>{const feedback=vi.fn();window.addEventListener('ravens:ui-feedback',feedback);render(<div data-private-feedback="true"><FeedbackButton>夜间确认</FeedbackButton></div>);fireEvent.click(screen.getByRole('button'));expect((feedback.mock.calls[0]![0] as CustomEvent).detail).toEqual({cue:'press',scope:'private'});window.removeEventListener('ravens:ui-feedback',feedback);});
