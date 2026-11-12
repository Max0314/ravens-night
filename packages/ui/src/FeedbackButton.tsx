import type {ComponentPropsWithRef} from 'react';
export type FeedbackButtonProps=ComponentPropsWithRef<'button'>&{feedback?:'press'|'select'|'open'|'close'|'none';feedbackScope?:'ui'|'private'};
/** Explicit button feedback; gestures, paper navigation and disabled clicks opt out. */
export function FeedbackButton({feedback='press',feedbackScope,onClick,...props}:FeedbackButtonProps){
 return <button {...props} onClick={event=>{const scope=feedbackScope??(event.currentTarget.closest('[data-private-feedback]')?'private':'ui');onClick?.(event);if(!props.disabled&&!event.defaultPrevented&&feedback!=='none')window.dispatchEvent(new CustomEvent('ravens:ui-feedback',{detail:{cue:feedback,scope}}));}}/>;
}
