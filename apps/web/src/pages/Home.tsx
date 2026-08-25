import { Button } from "@ravens/ui";
import type { RoomView } from "../api.js";
import { FilingLinks } from "../components/FilingLinks.js";

interface HomeProps {
  onCreate: () => void;
  onJoin: () => void;
  onTutorial: () => void;
  onRoles: () => void;
  activeRoom?: RoomView;
  activeMode?: "PLAYER" | "DISPLAY";
  onResume?: () => void;
  onLeave?: () => void;
  busy?: boolean;
  error?: string;
}

export function Home({ onCreate, onJoin, onTutorial, onRoles, activeRoom, activeMode, onResume, onLeave, busy = false, error }: HomeProps) {
  const canLeave = activeRoom?.state === "LOBBY" || activeMode === "DISPLAY";
  return (
    <main className="home">
      <header className="brand"><span className="brand__mark">☾</span><span>鸦钟夜话</span><small>RAVENS AT MIDNIGHT</small></header>
      <section className="home__copy">
        <h1>今夜，每个人都有秘密</h1>
        <p>围坐在同一张桌旁。手机只告诉你该知道的事，钟楼会主持余下的一切。</p>
        {activeRoom && onResume ? <section className="home__resume" aria-label="当前房间">
          <div><span>{activeMode === "DISPLAY" ? "公共大屏" : "当前游戏"}</span><strong>房间 {activeRoom.code}</strong><small>{activeRoom.state === "LOBBY" ? "尚未开局，可以安全退出并更换房间" : "本局仍在进行，身份和座位已为你保留"}</small></div>
          <div><Button onClick={onResume}>继续当前房间</Button>{canLeave && onLeave ? <Button variant="quiet" onClick={onLeave} disabled={busy}>{busy ? "正在退出…" : activeMode === "DISPLAY" ? "退出大屏" : "退出并更换房间"}</Button> : null}</div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </section> : <div className="home__actions"><Button onClick={onJoin}>加入一局</Button><Button variant="quiet" onClick={onCreate}>创建房间</Button></div>}
        <div className="home__guides"><button type="button" onClick={onTutorial}>先看 3 分钟教程</button><span>·</span><button type="button" onClick={onRoles}>翻阅 22 个角色</button></div>
        <ul className="home__features" aria-label="游戏特点"><li><strong>5–12</strong><span>游戏人数</span></li><li><strong>全自动</strong><span>无需真人主持</span></li><li><strong>零门槛</strong><span>内置新手教学</span></li></ul>
        <FilingLinks />
      </section>
      <div className="home__art" role="img" aria-label="午夜村庄中的六位人物" />
      <div className="home__clock" aria-hidden="true"><span>Ⅰ</span><span>Ⅳ</span><span>Ⅶ</span><span>Ⅹ</span></div>
    </main>
  );
}
