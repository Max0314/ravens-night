declare module 'virtual:ravens-audio-preview-catalog' {
  export interface PreviewTrack {
    url:string;id:string;title:string;group:'music'|'effects'|'candidate';channel:'music'|'effects';label:string;detail?:string;
    author?:string;license?:string;licenseUrl?:string;metadata?:string;sources:string[];
  }
  const tracks:PreviewTrack[];
  export default tracks;
}
