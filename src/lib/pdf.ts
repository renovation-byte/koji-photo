import { PDFDocument } from "pdf-lib";
import { decode, scale, toJpeg } from "./image";
import { PAGE_H, PAGE_W } from "./ledger";
import { drawPage, loadLogo, pagesOf, photoRects, type LedgerDoc } from "./render";

export type PdfQuality = "standard" | "light";
const Q = {
  // 文字と枠のページ画像（px/mm）、写真（px/mm・JPEG品質）
  standard: { page: 8, photo: 9, pq: 0.8 },
  light: { page: 5.5, photo: 5, pq: 0.7 },
};
const PT = 72 / 25.4;

/** 工事写真台帳のPDFを作る。onProgress(済, 全) */
export async function buildPdf(doc: LedgerDoc, quality: PdfQuality, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const q = Q[quality];
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.project.name} 工事写真台帳`);
  pdf.setCreator("工事写真台帳");
  pdf.setLanguage("ja-JP");
  const pages = pagesOf(doc);
  const logo = await loadLogo(doc);
  const cv = document.createElement("canvas");
  cv.width = Math.round(PAGE_W * q.page);
  cv.height = Math.round(PAGE_H * q.page);
  const ctx = cv.getContext("2d")!;
  let done = 0;
  const total = pages.length + doc.photos.length;
  for (const spec of pages) {
    drawPage(ctx, doc, spec, q.page, undefined, logo);
    const bg = await pdf.embedJpg(await (await toJpeg(cv, 0.85)).arrayBuffer());
    const page = pdf.addPage([PAGE_W * PT, PAGE_H * PT]);
    page.drawImage(bg, { x: 0, y: 0, width: PAGE_W * PT, height: PAGE_H * PT });
    onProgress?.(++done, total);
    for (const { photo, rect } of photoRects(doc, spec)) {
      const bmp = await decode(photo.image);
      const px = Math.round(Math.max(rect.w, rect.h) * q.photo);
      const jpg = await toJpeg(scale(bmp, px), q.pq);
      if ("close" in bmp) (bmp as ImageBitmap).close();
      const im = await pdf.embedJpg(await jpg.arrayBuffer());
      page.drawImage(im, { x: rect.x * PT, y: (PAGE_H - rect.y - rect.h) * PT, width: rect.w * PT, height: rect.h * PT });
      onProgress?.(++done, total);
    }
  }
  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
