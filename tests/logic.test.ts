import { describe, expect, it } from "vitest";
import { nextProjectNo } from "../src/db";
import { parseExifDateString, readExifDate } from "../src/lib/exif";
import { autoDescription, descriptionOf, fit, paginate, pdfFileName, slotsFor, sortForLedger, PAGE_H, PAGE_W } from "../src/lib/ledger";
import type { Photo, WorkType } from "../src/model";

const wt = (id: string, sortOrder: number): WorkType => ({ id, companyId: "c", name: id, sortOrder, archived: false, updatedAt: 0 });
let seq = 0;
const ph = (o: Partial<Photo>): Photo => ({
  id: "p" + ++seq, companyId: "c", projectId: "x", workTypeId: "木工事", location: "", status: "during",
  takenAt: 0, takenAtOriginal: 0, dateEdits: [], description: "", note: "", inLedger: true, sortOrder: 0,
  image: new Blob(), thumb: new Blob(), width: 4, height: 3, sha256: "", source: "camera", createdBy: "", createdAt: seq,
  updatedAt: 0, syncState: "local", ...o,
});

describe("工事番号の自動採番", () => {
  it("その年の最大＋1、4桁", () => {
    expect(nextProjectNo([], 2026)).toBe("2026-0001");
    expect(nextProjectNo(["2026-0001", "2026-0009", "2025-0050", "手入力"], 2026)).toBe("2026-0010");
  });
});

describe("台帳の並び", () => {
  const wts = [wt("解体工事", 1), wt("木工事", 3)];
  const a = ph({ location: "1階リビング", status: "after", takenAt: 50 });
  const b = ph({ location: "浴室", status: "before", takenAt: 10, workTypeId: "解体工事" });
  const c = ph({ location: "1階リビング", status: "before", takenAt: 20 });
  const d = ph({ location: "浴室", status: "during", takenAt: 30 });
  const e = ph({ location: "1階リビング", status: "during", takenAt: 40 });
  it("初期：施工箇所（最初に撮った順）→ 施工前・中・後 → 撮影日時", () => {
    expect(sortForLedger([a, b, c, d, e], "location", wts).map((p) => p.id)).toEqual([b, d, c, e, a].map((p) => p.id));
  });
  it("撮影日順", () => {
    expect(sortForLedger([a, b, c, d, e], "date", wts).map((p) => p.takenAt)).toEqual([10, 20, 30, 40, 50]);
  });
  it("工種順（工種の並び → 状況）", () => {
    expect(sortForLedger([a, b, c, d, e], "workType", wts)[0].id).toBe(b.id);
  });
  it("施工前→後", () => {
    expect(sortForLedger([a, b, c, d, e], "status", wts).map((p) => p.status)).toEqual(["before", "before", "during", "during", "after"]);
  });
});

describe("説明の定型文", () => {
  it("空なら「施工箇所 工種 施工状況」", () => {
    expect(autoDescription({ location: "1階リビング", status: "during" }, "木工事")).toBe("1階リビング 木工事 施工中");
    expect(descriptionOf(ph({ description: " 根太の補強 " }), "木工事")).toBe("根太の補強");
  });
});

describe("レイアウト", () => {
  it("写真は縦横比を保って枠に収まる", () => {
    const f = fit(3000, 4000, 100, 75);
    expect(f.h).toBeCloseTo(75);
    expect(f.w).toBeCloseTo(56.25);
    expect(f.x).toBeCloseTo((100 - 56.25) / 2);
  });
  it.each([2, 3, 4] as const)("%i枚：枠がページ内・重ならない", (n) => {
    const s = slotsFor(n);
    expect(s).toHaveLength(n);
    for (const x of s) {
      expect(x.frame.x).toBeGreaterThanOrEqual(0);
      expect(x.frame.y + x.frame.h).toBeLessThanOrEqual(PAGE_H);
      expect(x.frame.x + x.frame.w).toBeLessThanOrEqual(PAGE_W);
      expect(x.photo.h).toBeGreaterThan(40);
    }
    for (let i = 1; i < s.length; i++) {
      const p = s[i - 1].frame, q = s[i].frame;
      expect(q.y >= p.y + p.h || q.x >= p.x + p.w).toBe(true);
    }
  });
  it("ページ分け", () => {
    expect(paginate([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });
  it("ファイル名：工事名_工事写真台帳_作成日.pdf", () => {
    expect(pdfFileName("田中様邸 浴室/改修", new Date(2026, 9, 20).getTime())).toBe("田中様邸 浴室_改修_工事写真台帳_20261020.pdf");
  });
});

describe("EXIFの撮影日時", () => {
  it("文字列", () => {
    expect(parseExifDateString("2026:10:20 14:05:33")).toBe(new Date(2026, 9, 20, 14, 5, 33).getTime());
    expect(parseExifDateString("0000:00:00 00:00:00")).toBeNull();
  });
  it("JPEGから DateTimeOriginal を読む（ビッグエンディアン）", () => {
    // SOI + APP1(Exif) + TIFF(MM) + IFD0{ExifIFD} + ExifIFD{DateTimeOriginal}
    const date = "2025:03:04 05:06:07\0";
    const tiff: number[] = [];
    const u16 = (v: number) => tiff.push((v >> 8) & 255, v & 255);
    const u32 = (v: number) => tiff.push((v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255);
    tiff.push(0x4d, 0x4d); u16(42); u32(8);
    u16(1); u16(0x8769); u16(4); u32(1); u32(26); u32(0); // IFD0 @8 → ExifIFD @26
    u16(1); u16(0x9003); u16(2); u32(20); u32(44); u32(0); // ExifIFD @26 → 文字列 @44
    for (const ch of date) tiff.push(ch.charCodeAt(0));
    const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const len = app1.length + 2;
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...app1, 0xff, 0xd9]);
    expect(readExifDate(bytes.buffer)).toBe(new Date(2025, 2, 4, 5, 6, 7).getTime());
    expect(readExifDate(new Uint8Array([0x89, 0x50]).buffer)).toBeNull();
  });
});
