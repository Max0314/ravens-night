import { useState } from "react";

const qqPlaylistUrl = "https://y.qq.com/n/ryqq_v2/playlist/9757484827?ADTAG=h5_share_playlist&redirecttag=mn.redirect.custom&mnst=1.26";

export function GramophonePlayer() {
  const [open, setOpen] = useState(false);
  return <aside className={`gramophone${open ? " is-open" : ""}`} aria-label="背景音乐">
    {open ? <section className="gramophone__panel"><header><div><span aria-hidden="true">♫</span><strong>今夜的留声机</strong><small>QQ 音乐歌单</small></div><button type="button" aria-label="收起留声机" onClick={() => setOpen(false)}>×</button></header><p>在官方播放器中选择歌曲后播放。浏览器不会自动播放外部音频。</p><iframe title="QQ 音乐歌单" src={qqPlaylistUrl} allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" /><a href={qqPlaylistUrl} target="_blank" rel="noreferrer">在 QQ 音乐中打开 ↗</a></section> : null}
    <button className="gramophone__toggle" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}><span aria-hidden="true">◉</span><span>{open ? "收起音乐" : "留声机"}</span></button>
  </aside>;
}
