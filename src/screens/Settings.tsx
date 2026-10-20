import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db, ensureCompany } from "../db";
import { DAY, newId, TRASH_DAYS } from "../model";
import { decode, scale } from "../lib/image";
import { fmtDate } from "../lib/ledger";
import { currentUserName, restorePhotos } from "../store";
import { go, Header, Thumb, useBlobUrl, useUi } from "../ui";
import { useWorkTypes } from "../components/pickers";

/** ⑧ 会社設定（段階1はこの端末だけ）・工種・ゴミ箱 */
export function Settings() {
  const ui = useUi();
  const company = useLiveQuery(() => ensureCompany(), []);
  const wts = useWorkTypes();
  const [name, setName] = useState<string | null>(null);
  const [user, setUser] = useState(() => localStorage.getItem("koji_user_name") || "");
  const [newWt, setNewWt] = useState("");
  const logoUrl = useBlobUrl(company?.logo);
  const [usage, setUsage] = useState("");
  const trash = useLiveQuery(() => db.photos.filter((p) => !!p.deletedAt).toArray(), []) ?? [];
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1048576).toFixed(0)}MB 使用中`));
  }, [trash.length]);
  if (!company) return null;
  const loginName = (() => { try { return JSON.parse(localStorage.getItem("shinsan_login_v1") || "null")?.name || ""; } catch { return ""; } })();

  const saveName = async () => {
    if (name === null) return;
    await db.companies.update(company.id, { name: name.trim(), updatedAt: Date.now() });
    ui.toast("会社名を保存しました");
  };
  const setLogo = async (f?: File) => {
    if (!f) return;
    const img = await decode(f);
    const b = await new Promise<Blob>((r) => { const cv = scale(img, 800); cv.toBlob((x) => r(x!), "image/png"); });
    await db.companies.update(company.id, { logo: b, updatedAt: Date.now() });
    ui.toast("ロゴを登録しました");
  };
  const renameWt = async (id: string, v: string) => {
    v = v.trim();
    if (!v) return;
    await db.workTypes.update(id, { name: v, updatedAt: Date.now() });
  };
  const moveWt = async (i: number, d: number) => {
    const a = wts[i], b = wts[i + d];
    if (!a || !b) return;
    await db.transaction("rw", db.workTypes, async () => {
      await db.workTypes.update(a.id, { sortOrder: b.sortOrder });
      await db.workTypes.update(b.id, { sortOrder: a.sortOrder });
    });
  };
  const addWt = async () => {
    const v = newWt.trim();
    if (!v) return;
    const max = Math.max(0, ...wts.map((w) => w.sortOrder));
    await db.workTypes.add({ id: newId("wt_"), companyId: company.id, name: v, sortOrder: max + 1, archived: false, updatedAt: Date.now() });
    setNewWt("");
  };

  return (
    <>
      <Header title="設定" left={<button className="hbtn" onClick={() => go("")}>‹ ホーム</button>} />
      <div className="wrap">
        <div className="card">
          <div className="sec">🏢 会社（台帳の表紙・各ページの下に入ります）</div>
          <div className="fld"><label>会社名</label><input value={name ?? company.name} onChange={(e) => setName(e.target.value)} onBlur={saveName} placeholder="例：〇〇リフォーム株式会社" /></div>
          <div className="fld">
            <label>会社ロゴ（表紙に入ります）</label>
            {logoUrl && <img src={logoUrl} alt="" style={{ maxWidth: 220, maxHeight: 70, display: "block", marginBottom: 8 }} />}
            <div className="row">
              <label className="btn sub" style={{ cursor: "pointer" }}>画像を選ぶ<input type="file" accept="image/*" hidden onChange={(e) => setLogo(e.target.files?.[0])} /></label>
              {company.logo && <button className="btn red" onClick={() => db.companies.update(company.id, { logo: undefined })}>ロゴを外す</button>}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="sec">👤 担当者名</div>
          {loginName ? (
            <div className="note">見積アプリのログイン（{loginName}）を使っています。</div>
          ) : (
            <div className="fld"><label>あなたの名前（案件の担当者に入ります）</label><input value={user} onChange={(e) => { setUser(e.target.value); localStorage.setItem("koji_user_name", e.target.value); }} /></div>
          )}
          <div className="note">いまの名前：{currentUserName() || "（未設定）"}</div>
        </div>
        <div className="card">
          <div className="sec">🔨 工種（名前を変えると、過去の写真も新しい名前になります）</div>
          {wts.filter((w) => !w.archived).map((w, i) => (
            <div key={w.id} className="row" style={{ flexWrap: "nowrap", marginBottom: 6 }}>
              <input defaultValue={w.name} onBlur={(e) => renameWt(w.id, e.target.value)} />
              <button className="btn ghost" style={{ padding: "10px 12px" }} onClick={() => moveWt(i, -1)}>↑</button>
              <button className="btn ghost" style={{ padding: "10px 12px" }} onClick={() => moveWt(i, 1)}>↓</button>
              <button className="btn ghost" style={{ padding: "10px 12px" }} onClick={() => db.workTypes.update(w.id, { archived: true })} title="選択肢から外す（写真はそのまま）">✕</button>
            </div>
          ))}
          <div className="row" style={{ flexWrap: "nowrap", marginTop: 10 }}>
            <input value={newWt} onChange={(e) => setNewWt(e.target.value)} placeholder="工種を足す" />
            <button className="btn sub" onClick={addWt} style={{ flexShrink: 0 }}>追加</button>
          </div>
          {wts.some((w) => w.archived) && (
            <div className="note" style={{ marginTop: 10 }}>
              外した工種：{wts.filter((w) => w.archived).map((w) => (
                <button key={w.id} className="chip" style={{ margin: 3 }} onClick={() => db.workTypes.update(w.id, { archived: false })}>{w.name} ↩</button>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <div className="sec">🗑 ゴミ箱（{TRASH_DAYS}日たつと自動で消えます）</div>
          {!trash.length && <div className="note">ゴミ箱は空です。</div>}
          <div className="grid">
            {trash.map((p) => (
              <button key={p.id} className="ph" onClick={async () => { await restorePhotos([p.id]); ui.toast("写真を戻しました"); }}>
                <Thumb blob={p.thumb} />
                <div className="cap">↩ 戻す（あと{Math.max(0, Math.ceil((p.deletedAt! + TRASH_DAYS * DAY - Date.now()) / DAY))}日）</div>
                <div className="cap" style={{ paddingTop: 0, color: "var(--text3)" }}>{fmtDate(p.takenAt)}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="note" style={{ textAlign: "center" }}>この端末の保存：{usage}　版 0.1.0</div>
      </div>
    </>
  );
}
