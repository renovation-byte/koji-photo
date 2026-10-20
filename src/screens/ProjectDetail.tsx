import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useRef, useState } from "react";
import { db } from "../db";
import { STATUS_LABEL, type Photo, type ShootStatus } from "../model";
import { fmtDate, sortForLedger, ymd } from "../lib/ledger";
import { importFiles, getPreset, touchProject, trashPhotos, updatePhotos } from "../store";
import { go, Header, Thumb, useUi } from "../ui";
import { LocationPicker, StatusPicker, useRecentLocations, useWorkTypes, WorkTypePicker } from "../components/pickers";
import { PhotoSheet } from "../components/PhotoSheet";
import { defaultPreset } from "./Camera";

type Filter = { wt?: string; day?: string; loc?: string };

/** ③④⑤ 案件詳細＝写真一覧（絞り込み・拡大・まとめて編集） */
export function ProjectDetail({ id }: { id: string }) {
  const ui = useUi();
  const project = useLiveQuery(() => db.projects.get(id), [id]);
  const photos = useLiveQuery(() => db.photos.where("projectId").equals(id).filter((p) => !p.deletedAt).toArray(), [id]) ?? [];
  const wts = useWorkTypes();
  const recent = useRecentLocations(id);
  const [f, setF] = useState<Filter>({});
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [bulk, setBulk] = useState<"wt" | "loc" | "st" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const wtName = (wid: string) => wts.find((w) => w.id === wid)?.name ?? "（工種なし）";
  const days = useMemo(() => [...new Set(photos.map((p) => ymd(p.takenAt)))].sort().reverse(), [photos]);
  const locs = useMemo(() => [...new Set(photos.map((p) => p.location).filter(Boolean))], [photos]);
  const usedWts = useMemo(() => wts.filter((w) => photos.some((p) => p.workTypeId === w.id)), [wts, photos]);
  const list = sortForLedger(
    photos.filter((p) => (!f.wt || p.workTypeId === f.wt) && (!f.day || ymd(p.takenAt) === f.day) && (!f.loc || p.location === f.loc)),
    "location",
    wts,
  );
  const groups: { key: string; items: Photo[] }[] = [];
  for (const p of list) {
    const k = `${p.location || "（施工箇所なし）"}`;
    if (!groups.length || groups[groups.length - 1].key !== k) groups.push({ key: k, items: [] });
    groups[groups.length - 1].items.push(p);
  }

  if (project === undefined) return null;
  if (!project) return <div className="wrap"><div className="empty">案件が見つかりません。<br /><button className="btn" onClick={() => go("")}>ホームへ</button></div></div>;

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const fs = [...files];
    const preset = (await getPreset(id)) ?? defaultPreset(wts);
    const r = await importFiles(id, preset, fs, (i) => ui.busy(`写真を登録中… ${i + 1}/${fs.length}`, i / fs.length));
    ui.busy(null);
    await touchProject(id);
    ui.toast(`${r.added}枚 登録しました` + (r.dup ? `（同じ写真 ${r.dup}枚は登録しませんでした）` : "") + (r.bad ? `（読めない写真 ${r.bad}枚）` : ""));
  };
  const toggle = (pid: string) => {
    const n = new Set(sel);
    if (n.has(pid)) n.delete(pid);
    else n.add(pid);
    setSel(n);
  };
  const ids = [...(sel ?? [])];
  const applyBulk = async (patch: Partial<Photo>, msg: string) => {
    await updatePhotos(ids, patch);
    setBulk(null);
    ui.toast(`${ids.length}枚 ${msg}`);
  };

  return (
    <>
      <Header
        title={project.name || "（工事名なし）"}
        sub={[project.customerName && project.customerName + " 様", `No.${project.projectNo}`].filter(Boolean).join("　")}
        left={<button className="hbtn" onClick={() => go("")}>‹</button>}
        right={<button className="hbtn" onClick={() => go(`p/${id}/edit`)}>⚙ 情報</button>}
      />
      <div className="wrap">
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn sub" style={{ flex: 1 }} onClick={() => go(`p/${id}/ledger`)}>📄 台帳・PDF</button>
          <button className="btn sub" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}>🖼 アルバムから</button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        </div>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <b style={{ color: "var(--navy)", fontSize: 14 }}>写真 {photos.length}枚{list.length !== photos.length && `（表示 ${list.length}枚）`}</b>
          <button className="btn ghost" style={{ padding: "7px 11px", fontSize: 13 }} onClick={() => setSel(sel ? null : new Set())}>{sel ? "✕ 選択をやめる" : "☑ まとめて編集"}</button>
        </div>
        {photos.length > 0 && (
          <div style={{ display: "grid", gap: 6, marginBottom: 6 }}>
            <FilterRow label="工種" value={f.wt} items={usedWts.map((w) => [w.id, w.name])} onChange={(v) => setF({ ...f, wt: v })} />
            <FilterRow label="撮影日" value={f.day} items={days.map((d) => [d, fmtDate(Date.parse(d + "T00:00")).replace(/^\d+年/, "")])} onChange={(v) => setF({ ...f, day: v })} />
            <FilterRow label="箇所" value={f.loc} items={locs.map((l) => [l, l])} onChange={(v) => setF({ ...f, loc: v })} />
          </div>
        )}
        {groups.map((g) => (
          <div key={g.key}>
            <div className="grp">■ {g.key}<i>{g.items.length}枚</i></div>
            <div className="grid">
              {g.items.map((p) => (
                <button key={p.id} className={"ph" + (sel?.has(p.id) ? " picked" : "")} onClick={() => (sel ? toggle(p.id) : setOpen(p.id))}>
                  <Thumb blob={p.thumb} />
                  {sel && <span className="chk">✓</span>}
                  {!p.inLedger && <span className="out">台帳外</span>}
                  <div className="cap">{STATUS_LABEL[p.status]}・{wtName(p.workTypeId)}</div>
                  <div className="cap" style={{ paddingTop: 0, color: "var(--text3)" }}>{fmtDate(p.takenAt).replace(/^\d+年/, "")}{p.description ? "・" + p.description : ""}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
        {!photos.length && <div className="empty">写真はまだありません。<br />下の「📷 撮影する」から撮りましょう。</div>}
      </div>
      {!sel && (
        <div className="fab"><button className="btn huge" onClick={() => go(`p/${id}/camera`)}>📷 撮影する</button></div>
      )}
      {sel && (
        <div className="selbar">
          <b style={{ flex: "1 0 100%", color: "var(--navy)", fontSize: 14 }}>
            {ids.length}枚 選択中　<button className="btn ghost" style={{ padding: "4px 9px", fontSize: 12 }} onClick={() => setSel(new Set(list.map((p) => p.id)))}>表示中をすべて選ぶ</button>
          </b>
          <button className="btn ghost" disabled={!ids.length} onClick={() => setBulk("wt")}>工種</button>
          <button className="btn ghost" disabled={!ids.length} onClick={() => setBulk("loc")}>箇所</button>
          <button className="btn ghost" disabled={!ids.length} onClick={() => setBulk("st")}>状況</button>
          <button className="btn ghost" disabled={!ids.length} onClick={() => applyBulk({ inLedger: true }, "台帳に載せました")}>台帳に</button>
          <button className="btn ghost" disabled={!ids.length} onClick={() => applyBulk({ inLedger: false }, "台帳から外しました")}>外す</button>
          <button className="btn red" disabled={!ids.length} onClick={async () => { await trashPhotos(ids); setSel(new Set()); ui.toast(`${ids.length}枚 ゴミ箱に移しました（30日は戻せます）`); }}>削除</button>
        </div>
      )}
      {open && <PhotoSheet id={open} onClose={() => setOpen(null)} />}
      {bulk === "wt" && <WorkTypePicker onClose={() => setBulk(null)} onPick={(v) => applyBulk({ workTypeId: v }, "の工種を変えました")} />}
      {bulk === "loc" && <LocationPicker value="" recent={recent} onClose={() => setBulk(null)} onPick={(v) => applyBulk({ location: v }, "の施工箇所を変えました")} />}
      {bulk === "st" && <StatusPicker value={"during" as ShootStatus} onClose={() => setBulk(null)} onPick={(v) => applyBulk({ status: v }, "の施工状況を変えました")} />}
    </>
  );
}

function FilterRow({ label, value, items, onChange }: { label: string; value?: string; items: [string, string][]; onChange: (v?: string) => void }) {
  if (items.length < 2 && !value) return null;
  return (
    <div className="chips" style={{ alignItems: "center" }}>
      <span style={{ fontSize: 12, color: "var(--text3)", flexShrink: 0, width: 40 }}>{label}</span>
      <button className={"chip" + (!value ? " on" : "")} onClick={() => onChange(undefined)}>すべて</button>
      {items.map(([k, v]) => <button key={k} className={"chip" + (value === k ? " on" : "")} onClick={() => onChange(value === k ? undefined : k)}>{v}</button>)}
    </div>
  );
}

