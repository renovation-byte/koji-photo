// 台帳のページを描く。プレビューもPDFも同じ処理を使う（見た目が必ず一致する）。
// PDFでは、文字と枠をページの画像にし、写真は別にきれいな画質で重ねる。
import type { Company, Photo, Project, WorkType } from "../model";
import { STATUS_LABEL } from "../model";
import { decode } from "./image";
import { descriptionOf, fit, fmtDate, FOOT_H, HEAD_H, M, PAGE_H, PAGE_W, slotsFor, type Rect } from "./ledger";

export const FONT = `"Noto Sans JP","Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","Meiryo",sans-serif`;

export interface LedgerDoc {
  project: Project;
  company: Company;
  workTypes: WorkType[];
  photos: Photo[];
  layout: 2 | 3 | 4;
  showCover: boolean;
  createdAt: number;
}

export async function loadLogo(doc: LedgerDoc): Promise<CanvasImageSource | null> {
  if (!doc.company.logo) return null;
  try {
    return await decode(doc.company.logo);
  } catch {
    return null;
  }
}

export type PageSpec =
  | { kind: "cover" }
  | { kind: "photos"; photos: Photo[]; index: number; startNo: number };

export function pagesOf(doc: LedgerDoc): PageSpec[] {
  const per = doc.layout;
  const out: PageSpec[] = doc.showCover ? [{ kind: "cover" }] : [];
  for (let i = 0, n = 0; i < doc.photos.length; i += per, n++) {
    out.push({ kind: "photos", photos: doc.photos.slice(i, i + per), index: n, startNo: i + 1 });
  }
  if (!doc.photos.length && !doc.showCover) out.push({ kind: "photos", photos: [], index: 0, startNo: 1 });
  return out;
}

export function photoPageCount(doc: LedgerDoc) {
  return pagesOf(doc).filter((p) => p.kind === "photos").length;
}

/** 写真を置く場所（mm）。PDFで写真を重ねるのに使う */
export function photoRects(doc: LedgerDoc, page: PageSpec): { photo: Photo; rect: Rect }[] {
  if (page.kind !== "photos") return [];
  const slots = slotsFor(doc.layout);
  return page.photos.map((p, i) => {
    const s = slots[i].photo;
    const f = fit(p.width, p.height, s.w, s.h);
    return { photo: p, rect: { x: s.x + f.x, y: s.y + f.y, w: f.w, h: f.h } };
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\n/)) {
    let cur = "";
    for (const ch of para) {
      if (ctx.measureText(cur + ch).width > maxW && cur) {
        lines.push(cur);
        cur = ch;
      } else cur += ch;
    }
    lines.push(cur);
  }
  return lines;
}

/**
 * 1ページを canvas に描く。pxPerMm で解像度を決める。
 * images を渡すと写真も描く（プレビュー）。渡さなければ写真の場所は空ける（PDF）。
 */
export function drawPage(
  ctx: CanvasRenderingContext2D,
  doc: LedgerDoc,
  page: PageSpec,
  pxPerMm: number,
  images?: Map<string, CanvasImageSource>,
  logo?: CanvasImageSource | null,
) {
  const k = pxPerMm;
  const mm = (v: number) => v * k;
  const font = (pt: number, bold = false) => `${bold ? 700 : 400} ${pt * 0.3528 * k}px ${FONT}`;
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, mm(PAGE_W), mm(PAGE_H));
  ctx.fillStyle = "#111";
  ctx.strokeStyle = "#333";
  ctx.textBaseline = "alphabetic";
  const total = photoPageCount(doc);
  const p = doc.project;
  const wtName = (id: string) => doc.workTypes.find((w) => w.id === id)?.name ?? "";

  if (page.kind === "cover") {
    ctx.textAlign = "center";
    ctx.font = font(30, true);
    ctx.fillText("工 事 写 真 台 帳", mm(PAGE_W / 2), mm(78));
    ctx.lineWidth = mm(0.5);
    ctx.beginPath();
    ctx.moveTo(mm(45), mm(86));
    ctx.lineTo(mm(PAGE_W - 45), mm(86));
    ctx.stroke();
    ctx.font = font(18, true);
    wrap(ctx, p.name || "", mm(150)).forEach((l, i) => ctx.fillText(l, mm(PAGE_W / 2), mm(110 + i * 9)));
    ctx.font = font(14);
    let y = 140;
    if (p.customerName) { ctx.fillText(`${p.customerName} 様`, mm(PAGE_W / 2), mm(y)); y += 9; }
    ctx.font = font(11);
    if (p.address) { ctx.fillText(p.address, mm(PAGE_W / 2), mm(y)); y += 7; }
    ctx.font = font(10);
    const rows: [string, string][] = [];
    if (p.projectNo) rows.push(["工事番号", p.projectNo]);
    if (p.startDate || p.endDate) rows.push(["工　　期", `${p.startDate ? fmtDate(Date.parse(p.startDate)) : ""} 〜 ${p.endDate ? fmtDate(Date.parse(p.endDate)) : ""}`]);
    rows.push(["作 成 日", fmtDate(doc.createdAt)]);
    if (p.manager) rows.push(["担 当 者", p.manager]);
    ctx.textAlign = "left";
    rows.forEach(([a, b], i) => {
      ctx.fillText(a, mm(62), mm(186 + i * 7.5));
      ctx.fillText(b, mm(88), mm(186 + i * 7.5));
    });
    let cy = 248;
    if (logo) {
      const lw = (logo as HTMLImageElement).width || 1, lh = (logo as HTMLImageElement).height || 1;
      const f = fit(lw, lh, 70, 18);
      ctx.drawImage(logo, mm(PAGE_W / 2 - f.w / 2), mm(cy), mm(f.w), mm(f.h));
      cy += f.h + 7;
    } else cy += 12;
    if (doc.company.name) {
      ctx.textAlign = "center";
      ctx.font = font(13, true);
      ctx.fillText(doc.company.name, mm(PAGE_W / 2), mm(cy));
    }
    ctx.restore();
    return;
  }

  // ヘッダー：工事名・工事番号
  ctx.textAlign = "left";
  ctx.font = font(11, true);
  const hy = M + HEAD_H - 4;
  let title = p.name || "";
  const maxTitle = mm(PAGE_W - 2 * M - 40);
  while (ctx.measureText(title).width > maxTitle && title.length > 1) title = title.slice(0, -2) + "…";
  ctx.fillText(title, mm(M), mm(hy));
  ctx.textAlign = "right";
  ctx.font = font(9);
  if (p.projectNo) ctx.fillText(`No.${p.projectNo}`, mm(PAGE_W - M), mm(hy));
  ctx.lineWidth = mm(0.35);
  ctx.beginPath();
  ctx.moveTo(mm(M), mm(M + HEAD_H - 1.8));
  ctx.lineTo(mm(PAGE_W - M), mm(M + HEAD_H - 1.8));
  ctx.stroke();

  // フッター：会社名・ページ番号
  const fy = PAGE_H - M - FOOT_H + 6;
  ctx.font = font(8.5);
  ctx.textAlign = "left";
  if (doc.company.name) ctx.fillText(doc.company.name, mm(M), mm(fy));
  ctx.textAlign = "right";
  ctx.fillText(`${page.index + 1} / ${total}`, mm(PAGE_W - M), mm(fy));

  // 写真と説明
  const slots = slotsFor(doc.layout);
  const rects = photoRects(doc, page);
  page.photos.forEach((ph, i) => {
    const s = slots[i];
    ctx.lineWidth = mm(0.25);
    ctx.strokeStyle = "#555";
    ctx.strokeRect(mm(s.frame.x), mm(s.frame.y), mm(s.frame.w), mm(s.frame.h));
    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(mm(s.photo.x), mm(s.photo.y), mm(s.photo.w), mm(s.photo.h));
    const img = images?.get(ph.id);
    const r = rects[i].rect;
    if (img) ctx.drawImage(img, mm(r.x), mm(r.y), mm(r.w), mm(r.h));
    else { ctx.fillStyle = "#fff"; ctx.fillRect(mm(r.x), mm(r.y), mm(r.w), mm(r.h)); }
    ctx.fillStyle = "#111";
    drawCaption(ctx, k, s.text, page.startNo + i, ph, wtName(ph.workTypeId), doc.layout === 3);
  });
  ctx.restore();
}

function drawCaption(ctx: CanvasRenderingContext2D, k: number, t: Rect, no: number, p: Photo, wt: string, side: boolean) {
  const mm = (v: number) => v * k;
  const fs = side ? 9 : 8.2;
  const lh = fs * 0.3528 * 1.55;
  ctx.textAlign = "left";
  const rows: [string, string][] = [
    ["工種", wt],
    ["施工箇所", p.location],
    ["施工状況", STATUS_LABEL[p.status]],
    ["撮影日", fmtDate(p.takenAt)],
  ];
  const labelW = side ? 15 : 14;
  let y = t.y + lh;
  ctx.font = `700 ${fs * 0.3528 * k}px ${FONT}`;
  ctx.fillText(`No.${no}`, mm(t.x), mm(y));
  y += lh * (side ? 1.25 : 1.1);
  if (side) {
    for (const [a, b] of rows) {
      ctx.font = `700 ${fs * 0.3528 * k}px ${FONT}`;
      ctx.fillText(a, mm(t.x), mm(y));
      ctx.font = `400 ${fs * 0.3528 * k}px ${FONT}`;
      const ls = wrap(ctx, b || "", mm(t.w - labelW));
      ls.forEach((l, i) => ctx.fillText(l, mm(t.x + labelW), mm(y + i * lh)));
      y += lh * Math.max(1, ls.length) + lh * 0.25;
    }
    ctx.font = `700 ${fs * 0.3528 * k}px ${FONT}`;
    ctx.fillText("説明", mm(t.x), mm(y));
    y += lh;
  } else {
    // 下に説明：2列で詰める
    ctx.font = `400 ${fs * 0.3528 * k}px ${FONT}`;
    const half = t.w / 2;
    rows.forEach(([a, b], i) => {
      const x = t.x + (i % 2) * half;
      const yy = y + Math.floor(i / 2) * lh;
      ctx.font = `700 ${fs * 0.3528 * k}px ${FONT}`;
      ctx.fillText(a, mm(x), mm(yy));
      ctx.font = `400 ${fs * 0.3528 * k}px ${FONT}`;
      let s = b || "";
      while (ctx.measureText(s).width > mm(half - labelW - 1) && s.length > 1) s = s.slice(0, -2) + "…";
      ctx.fillText(s, mm(x + labelW), mm(yy));
    });
    y += lh * 2;
  }
  ctx.font = `400 ${fs * 0.3528 * k}px ${FONT}`;
  const desc = descriptionOf(p, wt);
  const maxLines = Math.max(1, Math.floor((t.y + t.h - y) / lh) + 1);
  let ls = wrap(ctx, desc, mm(t.w - (side ? 2 : 0)));
  if (ls.length > maxLines) {
    ls = ls.slice(0, maxLines);
    ls[maxLines - 1] = ls[maxLines - 1].slice(0, -1) + "…";
  }
  ls.forEach((l, i) => ctx.fillText(l, mm(t.x + (side ? 2 : 0)), mm(y + i * lh)));
}
