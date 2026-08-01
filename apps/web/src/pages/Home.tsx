import { Button } from "@ravens/ui";

export function Home({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <main className="home">
      <header className="brand"><span className="brand__mark">☾</span><span>鸦钟夜话</span></header>
      <section className="home__copy">
        <h1>今夜，每个人都有秘密</h1>
        <p>围坐在同一张桌旁。手机只告诉你该知道的事，钟楼会主持余下的一切。</p>
        <div className="home__actions"><Button onClick={onJoin}>加入一局</Button><Button variant="quiet" onClick={onCreate}>创建房间</Button></div>
        <p className="home__note">5–12 人 · 无需真人主持 · 为第一次游玩设计</p>
      </section>
      <div className="home__art" role="img" aria-label="午夜村庄中的六位人物" />
      <div className="home__clock" aria-hidden="true"><span>Ⅻ</span><span>Ⅲ</span><span>Ⅵ</span><span>Ⅸ</span></div>
    </main>
  );
}
