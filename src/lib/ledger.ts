import { STATUS_LABEL, STATUS_ORDER, type LedgerSort, type Photo, type WorkType } from "../model";

export function fmtDate(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
export function ymd(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 写真説明が空のときの定型文（例「1階リビング 木工事 施工中」） */
export function autoDescription(p: Pick<Photo, "location" | "status">, workTypeName: string): string {
  return [p.location, workTypeName, STATUS_LABEL[p.status]].filter(Boolean).join(" ");
}
export function descriptionOf(p: Photo, workTypeName: string): string {
  return p.description.trim() || autoDescription(p, workTypeName);
}

/** 台帳の並び。初期は「施工箇所 → 施工前・中・後 → 撮影日時」。施工箇所の順は、その箇所を最初に撮った順。 */
export function sortForLedger(photos: Photo[], mode: LedgerSort, workTypes: WorkType[]): Photo[] {
  const st = (p: Photo) => STATUS_ORDER.indexOf(p.status);
  const wtOrder = new Map(workTypes.map((w) => [w.id, w.sortOrder]));
  const wt = (p: Photo) => wtOrder.get(p.workTypeId) ?? 9999;
  const firstAt = new Map<string, number>();
  for (const p of photos) {
    const k = p.location || "";
    firstAt.set(k, Math.min(firstAt.get(k) ?? Infinity, p.takenAt));
  }
  const loc = (p: Photo) => firstAt.get(p.location || "") ?? 0;
  const keys: Record<LedgerSort, ((p: Photo) => number | string)[]> = {
    location: [loc, (p) => p.location, st, (p) => p.takenAt],
    workType: [wt, st, loc, (p) => p.takenAt],
    date: [(p) => p.takenAt],
    status: [st, loc, (p) => p.location, (p) => p.takenAt],
  };
  const ks = [...keys[mode], (p: Photo) => p.createdAt, (p: Photo) => p.id];
  return [...photos].sort((a, b) => {
    for (const k of ks) {
      const x = k(a), y = k(b);
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  });
}

export function paginate<T>(items: T[], per: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += per) out.push(items.slice(i, i + per));
  return out;
}

/** 写真を枠に収める（縦横比を保つ・トリミングしない） */
export function fit(w: number, h: number, bw: number, bh: number) {
  const k = Math.min(bw / w, bh / h);
  const fw = w * k, fh = h * k;
  return { x: (bw - fw) / 2, y: (bh - fh) / 2, w: fw, h: fh };
}

// ---- ページの寸法（mm、A4縦） ----
export const PAGE_W = 210, PAGE_H = 297;
export const M = 12; // 余白
export const HEAD_H = 13, FOOT_H = 9;

export interface Rect { x: number; y: number; w: number; h: number }
export interface Slot { photo: Rect; text: Rect; frame: Rect }

/** 1ページの枠。3枚＝左に写真・右に説明、2枚・4枚＝写真の下に説明 */
export function slotsFor(layout: 2 | 3 | 4): Slot[] {
  const top = M + HEAD_H, bottom = PAGE_H - M - FOOT_H, cw = PAGE_W - 2 * M;
  const gap = 4;
  const slots: Slot[] = [];
  if (layout === 3) {
    const rh = (bottom - top - gap * 2) / 3;
    for (let i = 0; i < 3; i++) {
      const y = top + i * (rh + gap);
      const pw = 116;
      slots.push({
        frame: { x: M, y, w: cw, h: rh },
        photo: { x: M + 1.5, y: y + 1.5, w: pw - 3, h: rh - 3 },
        text: { x: M + pw + 2, y: y + 2, w: cw - pw - 4, h: rh - 4 },
      });
    }
  } else if (layout === 2) {
    const rh = (bottom - top - gap) / 2, th = 26;
    for (let i = 0; i < 2; i++) {
      const y = top + i * (rh + gap);
      slots.push({
        frame: { x: M, y, w: cw, h: rh },
        photo: { x: M + 1.5, y: y + 1.5, w: cw - 3, h: rh - th - 3 },
        text: { x: M + 2, y: y + rh - th + 1, w: cw - 4, h: th - 2 },
      });
    }
  } else {
    const cw2 = (cw - gap) / 2, rh = (bottom - top - gap) / 2, th = 30;
    for (let i = 0; i < 4; i++) {
      const x = M + (i % 2) * (cw2 + gap), y = top + Math.floor(i / 2) * (rh + gap);
      slots.push({
        frame: { x, y, w: cw2, h: rh },
        photo: { x: x + 1.5, y: y + 1.5, w: cw2 - 3, h: rh - th - 3 },
        text: { x: x + 2, y: y + rh - th + 1, w: cw2 - 4, h: th - 2 },
      });
    }
  }
  return slots;
}

export function pdfFileName(projectName: string, t: number): string {
  const safe = (projectName || "工事").replace(/[\\/:*?"<>|\r\n]+/g, "_").trim();
  return `${safe}_工事写真台帳_${ymd(t).replace(/-/g, "")}.pdf`;
}
