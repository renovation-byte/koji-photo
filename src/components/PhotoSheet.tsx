import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "../db";
import { STATUS_LABEL, type Photo, type ShootStatus } from "../model";
import { autoDescription, fmtDate, ymd } from "../lib/ledger";
import { trashPhotos, updatePhotos } from "../store";
import { Sheet, useBlobUrl, useUi } from "../ui";
import { LocationPicker, StatusPicker, useRecentLocations, useWorkTypes, WorkTypePicker } from "./pickers";

/** 写真1枚：拡大表示と編集 */
export function PhotoSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const ui = useUi();
  const p = useLiveQuery(() => db.photos.get(id), [id]);
  const wts = useWorkTypes();
  const recent = useRecentLocations(p?.projectId ?? "");
  const [pick, setPick] = useState<"wt" | "loc" | "st" | null>(null);
  const [desc, setDesc] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const url = useBlobUrl(p?.image);
  if (!p) return null;
  const wtName = wts.find((w) => w.id === p.workTypeId)?.name ?? "";
  const save = (patch: Partial<Photo>) => updatePhotos([p.id], patch);
  const changeDate = async (v: string) => {
    if (!v) return;
    const old = new Date(p.takenAt);
    const [y, m, d] = v.split("-").map(Number);
    const t = new Date(y, m - 1, d, old.getHours(), old.getMinutes(), old.getSeconds()).getTime();
    await save({ takenAt: t });
    ui.toast("撮影日を直しました（元の日付は記録に残ります）");
  };
  return (
    <Sheet title="写真" onClose={onClose}>
      <img src={url} alt="" style={{ width: "100%", borderRadius: 8, background: "#26324a", maxHeight: "48vh", objectFit: "contain" }} />
      <div className="g2" style={{ marginTop: 12 }}>
        <Field label="工種" value={wtName} onClick={() => setPick("wt")} />
        <Field label="施工状況" value={STATUS_LABEL[p.status]} onClick={() => setPick("st")} />
      </div>
      <Field label="施工箇所" value={p.location || "（未設定）"} onClick={() => setPick("loc")} />
      <div className="fld">
        <label>撮影日</label>
        <input type="date" value={ymd(p.takenAt)} onChange={(e) => changeDate(e.target.value)} />
        {p.dateEdits?.length > 0 && <div className="note">元の撮影日：{fmtDate(p.takenAtOriginal)}（{p.dateEdits.at(-1)!.by || "不明"} が修正）</div>}
      </div>
      <div className="fld">
        <label>写真説明（台帳に載ります。空なら自動の文）</label>
        <textarea value={desc ?? p.description} placeholder={autoDescription(p, wtName)} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== null && save({ description: desc })} />
      </div>
      <div className="fld">
        <label>備考（社内メモ・台帳には載りません）</label>
        <input value={note ?? p.note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== null && save({ note })} />
      </div>
      <label className="row" style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
        <input type="checkbox" checked={p.inLedger} onChange={(e) => save({ inLedger: e.target.checked })} style={{ width: 22, height: 22 }} />
        台帳に載せる
      </label>
      <div className="row">
        <button className="btn" style={{ flex: 1 }} onClick={async () => { if (desc !== null) await save({ description: desc }); if (note !== null) await save({ note }); onClose(); }}>閉じる</button>
        <button className="btn red" onClick={async () => { await trashPhotos([p.id]); ui.toast("ゴミ箱に移しました（30日は戻せます）"); onClose(); }}>削除</button>
      </div>
      {pick === "wt" && <WorkTypePicker value={p.workTypeId} onClose={() => setPick(null)} onPick={(v) => { save({ workTypeId: v }); setPick(null); }} />}
      {pick === "loc" && <LocationPicker value={p.location} recent={recent} onClose={() => setPick(null)} onPick={(v) => { save({ location: v }); setPick(null); }} />}
      {pick === "st" && <StatusPicker value={p.status} onClose={() => setPick(null)} onPick={(v: ShootStatus) => { save({ status: v }); setPick(null); }} />}
    </Sheet>
  );
}

export function Field({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <div className="fld">
      <label>{label}</label>
      <button onClick={onClick} style={{ width: "100%", textAlign: "left", padding: "11px 12px", border: "1.5px solid var(--border2)", borderRadius: 9, background: "#fbfcfe", fontSize: 15 }}>
        {value} <span style={{ float: "right", color: "var(--text3)" }}>▾</span>
      </button>
    </div>
  );
}
