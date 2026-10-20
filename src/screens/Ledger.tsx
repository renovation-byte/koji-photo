import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { db, ensureCompany } from "../db";
import type { LedgerSettings, LedgerSort } from "../model";
import { decode } from "../lib/image";
import { pdfFileName, sortForLedger } from "../lib/ledger";
import type { PdfQuality } from "../lib/pdf";
import { drawPage, loadLogo, pagesOf, type LedgerDoc } from "../lib/render";
import { PAGE_H, PAGE_W } from "../lib/ledger";
import { go, Header, useUi } from "../ui";
import { useWorkTypes } from "../components/pickers";

const SORTS: [LedgerSort, string][] = [
  ["location", "施工箇所ごと"],
  ["workType", "工種ごと"],
  ["status", "施工前→後"],
  ["date", "撮影日順"],
];

/** ⑥⑦ 台帳のプレビューとPDF */
export function Ledger({ id }: { id: string }) {
  const ui = useUi();
  const project = useLiveQuery(() => db.projects.get(id), [id]);
  const company = useLiveQuery(() => ensureCompany(), []);
  const photos = useLiveQuery(() => db.photos.where("projectId").equals(id).filter((p) => !p.deletedAt && p.inLedger).toArray(), [id]);
  const wts = useWorkTypes();
  const saved = useLiveQuery(() => db.ledgers.get(id), [id]);
  const st: LedgerSettings = saved ?? { projectId: id, layout: 3, sort: "location", showCover: true, updatedAt: 0 };
  const setSt = (patch: Partial<LedgerSettings>) => db.ledgers.put({ ...st, ...patch, updatedAt: Date.now() });
  const [previews, setPreviews] = useState<string[]>([]);
  const [made, setMade] = useState<{ blob: Blob; name: string } | null>(null);

  const doc = useMemo<LedgerDoc | null>(() => {
    if (!project || !company || !photos) return null;
    return { project, company, workTypes: wts, photos: sortForLedger(photos, st.sort, wts), layout: st.layout, showCover: st.showCover, createdAt: Date.now() };
  }, [project, company, photos, wts, st.sort, st.layout, st.showCover]);

  // ページ単位のプレビュー（PDFと同じ描き方）
  useEffect(() => {
    if (!doc) return;
    let cancel = false;
    const urls: string[] = [];
    (async () => {
      const k = 3.2;
      const logo = await loadLogo(doc);
      const imgs = new Map<string, CanvasImageSource>();
      const out: string[] = [];
      for (const spec of pagesOf(doc)) {
        if (spec.kind === "photos") {
          for (const p of spec.photos) if (!imgs.has(p.id)) imgs.set(p.id, await decode(p.thumb));
        }
        if (cancel) return;
        const cv = document.createElement("canvas");
        cv.width = Math.round(PAGE_W * k);
        cv.height = Math.round(PAGE_H * k);
        drawPage(cv.getContext("2d")!, doc, spec, k, imgs, logo);
        const b = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/jpeg", 0.8));
        if (b) { const u = URL.createObjectURL(b); urls.push(u); out.push(u); }
        if (out.length % 3 === 0 && !cancel) setPreviews([...out]);
      }
      if (!cancel) setPreviews(out);
    })();
    return () => { cancel = true; setTimeout(() => urls.forEach(URL.revokeObjectURL), 1000); };
  }, [doc]);

  useEffect(() => { setMade(null); }, [doc]);

  if (!project || !doc) return null;

  const make = async (q: PdfQuality) => {
    if (!doc.photos.length) return ui.toast("台帳に載せる写真がありません");
    try {
      ui.busy("PDFを作成中…", 0);
      const { buildPdf } = await import("../lib/pdf");
      const blob = await buildPdf({ ...doc, createdAt: Date.now() }, q, (d, t) => ui.busy("PDFを作成中…", d / t));
      setMade({ blob, name: pdfFileName(project.name, Date.now()) });
      ui.busy(null);
      ui.toast(`PDFができました（${(blob.size / 1048576).toFixed(1)}MB）`);
    } catch (e) {
      ui.busy(null);
      ui.toast("PDFを作れませんでした：" + (e instanceof Error ? e.message : ""));
    }
  };
  const file = () => new File([made!.blob], made!.name, { type: "application/pdf" });
  const share = async () => {
    const f = file();
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], title: made!.name }); } catch { /* 取り消し */ }
    } else download();
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(made!.blob);
    a.download = made!.name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  };
  const print = () => {
    const url = URL.createObjectURL(made!.blob);
    const touch = matchMedia("(pointer:coarse)").matches;
    if (touch) { window.open(url, "_blank"); return; }
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
    f.src = url;
    f.onload = () => { try { f.contentWindow?.print(); } catch { window.open(url, "_blank"); } };
    document.body.appendChild(f);
    setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 120000);
  };

  return (
    <>
      <Header title="工事写真台帳" sub={project.name} left={<button className="hbtn" onClick={() => go("p/" + id)}>‹ 写真</button>} />
      <div className="wrap">
        <div className="card">
          <div className="fld">
            <label>1ページの枚数</label>
            <div className="opt">
              {([3, 2, 4] as const).map((n) => <button key={n} className={st.layout === n ? "on" : ""} onClick={() => setSt({ layout: n })}>{n}枚{n === 3 ? "（標準）" : ""}</button>)}
            </div>
          </div>
          <div className="fld">
            <label>並び順</label>
            <div className="opt">
              {SORTS.map(([k, v]) => <button key={k} className={st.sort === k ? "on" : ""} onClick={() => setSt({ sort: k })}>{v}</button>)}
            </div>
          </div>
          <label className="row" style={{ fontSize: 14, fontWeight: 700 }}>
            <input type="checkbox" checked={st.showCover} onChange={(e) => setSt({ showCover: e.target.checked })} style={{ width: 22, height: 22 }} />
            表紙を付ける
          </label>
          <div className="note" style={{ marginTop: 8 }}>
            台帳に載る写真：{doc.photos.length}枚（「台帳外」にした写真は載りません）。写真説明が空の写真は「施工箇所 工種 施工状況」の文が入ります。
          </div>
        </div>
        {!made ? (
          <div className="card">
            <button className="btn huge" onClick={() => make("standard")} disabled={!doc.photos.length}>📄 PDFを作る</button>
            <button className="btn ghost wide" style={{ marginTop: 10 }} onClick={() => make("light")} disabled={!doc.photos.length}>軽量版（画面で見る用・LINE向け）で作る</button>
          </div>
        ) : (
          <div className="card">
            <div className="sec">✔ PDFができました　<span className="note">{made.name}・{(made.blob.size / 1048576).toFixed(1)}MB</span></div>
            <button className="btn huge" onClick={share}>📤 共有（LINE・メールなど）</button>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn sub" style={{ flex: 1 }} onClick={download}>⬇ 保存</button>
              <button className="btn sub" style={{ flex: 1 }} onClick={print}>🖨 印刷</button>
            </div>
            <button className="btn ghost wide" style={{ marginTop: 10 }} onClick={() => setMade(null)}>作り直す</button>
          </div>
        )}
        <div className="sec">プレビュー（{pagesOf(doc).length}ページ）</div>
        <div className="pages">
          {previews.map((u, i) => <img key={i} src={u} alt={`${i + 1}ページ`} />)}
        </div>
      </div>
    </>
  );
}
