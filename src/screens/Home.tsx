import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "../db";
import type { Project } from "../model";
import { fmtDate } from "../lib/ledger";
import { go, Header, Thumb } from "../ui";

function useCounts() {
  return (
    useLiveQuery(async () => {
      const m = new Map<string, { n: number; last?: { thumb: Blob; t: number } }>();
      await db.photos.each((p) => {
        if (p.deletedAt) return;
        const e = m.get(p.projectId) ?? { n: 0 };
        e.n++;
        if (!e.last || p.takenAt > e.last.t) e.last = { thumb: p.thumb, t: p.takenAt };
        m.set(p.projectId, e);
      });
      return m;
    }, []) ?? new Map()
  );
}

export function ProjectRow({ p, info }: { p: Project; info?: { n: number; last?: { thumb: Blob; t: number } } }) {
  return (
    <button className="pj" onClick={() => go("p/" + p.id)}>
      <div className="th">{info?.last ? <Thumb blob={info.last.thumb} /> : "📷"}</div>
      <div className="tx">
        <div className="nm">{p.name || "（工事名なし）"}</div>
        <div className="ds">{[p.customerName && p.customerName + " 様", p.address].filter(Boolean).join("　")}</div>
        <div className="ds" style={{ color: "var(--text3)" }}>
          No.{p.projectNo}　{info?.last ? "最終撮影 " + fmtDate(info.last.t) : "写真はまだありません"}
        </div>
      </div>
      <span className={"badge" + (p.status === "done" ? " done" : "")}>{p.status === "done" ? "完了" : `${info?.n ?? 0}枚`}</span>
    </button>
  );
}

/** ① ダッシュボード：最後に使った案件の「撮影」をいちばん上に */
export function Home() {
  const projects = useLiveQuery(() => db.projects.orderBy("lastUsedAt").reverse().filter((p) => !p.deletedAt).toArray(), []);
  const counts = useCounts();
  if (!projects) return null;
  const active = projects.filter((p) => p.status === "active");
  const last = active[0];
  return (
    <>
      <Header title="工事写真台帳" sub="撮ったら、その場で台帳ができる" right={<button className="hbtn" onClick={() => go("settings")}>⚙ 設定</button>} />
      <div className="wrap">
        {last ? (
          <div className="card">
            <div className="sec">🏗 今日の現場</div>
            <ProjectRow p={last} info={counts.get(last.id)} />
            <button className="btn huge" style={{ marginTop: 6 }} onClick={() => go(`p/${last.id}/camera`)}>📷 撮影する</button>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn ghost" style={{ flex: 1 }} onClick={() => go(`p/${last.id}/ledger`)}>📄 台帳・PDF</button>
              <button className="btn ghost" style={{ flex: 1 }} onClick={() => go(`p/${last.id}`)}>🖼 写真一覧</button>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="empty">まだ案件がありません。<br />まず「＋ 新しい案件」を登録してください。</div>
          </div>
        )}
        <div className="card">
          <div className="sec" style={{ justifyContent: "space-between" }}>
            <span>📁 最近の案件</span>
            <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 13 }} onClick={() => go("projects")}>すべて見る ›</button>
          </div>
          {active.slice(1, 6).map((p) => <ProjectRow key={p.id} p={p} info={counts.get(p.id)} />)}
          {active.length <= 1 && <div className="note">ほかの進行中の案件はありません。</div>}
        </div>
        <div className="note" style={{ textAlign: "center" }}>
          いまは写真を<b>この端末の中</b>に保存しています（クラウドとの同期は次の段階で入ります）。
        </div>
      </div>
      <div className="fab"><button className="btn wide" style={{ padding: 15 }} onClick={() => go("new")}>＋ 新しい案件</button></div>
    </>
  );
}

/** ② 案件一覧 */
export function Projects() {
  const [q, setQ] = useState("");
  const [showDone, setShowDone] = useState(false);
  const projects = useLiveQuery(() => db.projects.orderBy("lastUsedAt").reverse().filter((p) => !p.deletedAt).toArray(), []) ?? [];
  const counts = useCounts();
  const list = projects.filter((p) => (showDone ? p.status === "done" : p.status === "active") && (!q || [p.name, p.customerName, p.address, p.projectNo].join(" ").includes(q)));
  return (
    <>
      <Header title="案件一覧" left={<button className="hbtn" onClick={() => go("")}>‹ ホーム</button>} />
      <div className="wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 工事名・お客様名・住所・工事番号" style={{ marginBottom: 10 }} />
        <div className="chips" style={{ marginBottom: 10 }}>
          <button className={"chip" + (!showDone ? " on" : "")} onClick={() => setShowDone(false)}>進行中</button>
          <button className={"chip" + (showDone ? " on" : "")} onClick={() => setShowDone(true)}>完了</button>
        </div>
        {list.map((p) => <ProjectRow key={p.id} p={p} info={counts.get(p.id)} />)}
        {!list.length && <div className="empty">該当する案件はありません。</div>}
      </div>
      <div className="fab"><button className="btn wide" style={{ padding: 15 }} onClick={() => go("new")}>＋ 新しい案件</button></div>
    </>
  );
}
