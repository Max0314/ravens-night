import { AudioSettings } from './AudioSettings.js';
import './global-audio-button.css';

export function GlobalAudioButton(props:{className?:string;onEnable?:()=>void;display?:boolean;privateControls?:boolean}) {
  return <AudioSettings asNote {...props}/>;
}
