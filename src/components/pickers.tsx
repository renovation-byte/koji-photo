import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, ensureCompany } from "../db";
import { FLOORS, newId, ROOMS, STATUS_LABEL, STATUS_ORDER, type ShootStatus } from "../model";
import { Sheet } from "../ui";

export function useWorkTypes() {
  return useLiveQuery(() => db.workTypes.orderBy("sortOrder").toArray(), [], []) ?? [];
}

/** 工種を選ぶ（担当者も、その場で工種を足せる） */
export function WorkTypePicker({ value, onPick, onClose }: { value?: string; onPick: (id: string) => void; onClose: () => void }) {
  const wts = useWorkTypes().filter((w) => !w.archived);
  const [adding, setAdding] = useState("");
  const add = async () => {
    const name = adding.trim();
    if (!name) return;
    const ex = wts.find((w) => w.name === name);
    if (ex) return onPick(ex.id);
    const c = await ensureCompany();
    const max = Math.max(0, ...(await db.workTypes.toArray()).map((w) => w.sortOrder));
    const id = newId("wt_");
    await db.workTypes.add({ id, companyId: c.id, name, sortOrder: max + 1, archived: false, updatedAt: Date.now() });
    onPick(id);
  };
  return (
    <Sheet title="工種" onClose={onClose}>
      <div className="opt">
        {wts.map((w) => (
          <button key={w.id} className={w.id === value ? "on" : ""} onClick={() => onPick(w.id)}>{w.name}</button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 14, flexWrap: "nowrap" }}>
        <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="工種を足す（例：断熱工事）" />
        <button className="btn sub" onClick={add} disabled={!adding.trim()} style={{ flexShrink: 0 }}>追加</button>
      </div>
    </Sheet>
  );
}

/** 施工箇所：階 × 部屋のボタン＋自由入力。この案件で使った箇所を先頭に */
export function LocationPicker({ value, recent, onPick, onClose }: { value: string; recent: string[]; onPick: (v: string) => void; onClose: () => void }) {
  const [floor, setFloor] = useState(() => FLOORS.find((f) => value.startsWith(f)) ?? "");
  const [text, setText] = useState(value);
  return (
    <Sheet title="施工箇所" onClose={onClose}>
      {recent.length > 0 && (
        <>
          <div className="note" style={{ marginBottom: 6 }}>この案件で使った箇所</div>
          <div className="opt" style={{ marginBottom: 14 }}>
            {recent.map((r) => <button key={r} className={r === value ? "on" : ""} onClick={() => onPick(r)}>{r}</button>)}
          </div>
        </>
      )}
      <div className="note" style={{ marginBottom: 6 }}>① 階（なしでも可）</div>
      <div className="opt" style={{ marginBottom: 12 }}>
        {FLOORS.map((f) => <button key={f} className={f === floor ? "on" : ""} onClick={() => setFloor(f === floor ? "" : f)}>{f}</button>)}
      </div>
      <div className="note" style={{ marginBottom: 6 }}>② 場所（押すと決まります）</div>
      <div className="opt" style={{ marginBottom: 14 }}>
        {ROOMS.map((r) => <button key={r} onClick={() => onPick(floor && floor !== r ? floor + r : r)}>{r}</button>)}
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="自由に入力（例：2階 北側洋室）" />
        <button className="btn" onClick={() => onPick(text.trim())} style={{ flexShrink: 0 }}>決定</button>
      </div>
    </Sheet>
  );
}

export function StatusPicker({ value, onPick, onClose }: { value: ShootStatus; onPick: (s: ShootStatus) => void; onClose: () => void }) {
  return (
    <Sheet title="施工状況" onClose={onClose}>
      <div className="opt">
        {STATUS_ORDER.map((s) => (
          <button key={s} className={s === value ? "on" : ""} style={{ padding: "14px 18px", fontSize: 16 }} onClick={() => onPick(s)}>{STATUS_LABEL[s]}</button>
        ))}
      </div>
    </Sheet>
  );
}

/** その案件で使った施工箇所（新しい順） */
export function useRecentLocations(projectId: string): string[] {
  return (
    useLiveQuery(async () => {
      const ps = await db.photos.where("projectId").equals(projectId).toArray();
      const m = new Map<string, number>();
      for (const p of ps) if (p.location && !p.deletedAt) m.set(p.location, Math.max(m.get(p.location) ?? 0, p.createdAt));
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]).slice(0, 16);
    }, [projectId], []) ?? []
  );
}
