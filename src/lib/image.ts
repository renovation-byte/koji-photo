import { readExifDate } from "./exif";

export const IMAGE_MAX = 2000; // クラウドにも置く写真の長辺
export const THUMB_MAX = 400;

export interface Processed {
  image: Blob;
  thumb: Blob;
  width: number;
  height: number;
  sha256: string;
  exifTime: number | null;
}

type Drawable = ImageBitmap | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

export async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      /* 下の方法で読む */
    }
  }
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { res(img); URL.revokeObjectURL(url); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("画像を読めませんでした")); };
    img.src = url;
  });
}

function sizeOf(src: Drawable): [number, number] {
  if (src instanceof HTMLVideoElement) return [src.videoWidth, src.videoHeight];
  if (src instanceof HTMLImageElement) return [src.naturalWidth, src.naturalHeight];
  return [src.width, src.height];
}

export function scale(src: Drawable, max: number): HTMLCanvasElement {
  const [w, h] = sizeOf(src);
  const k = Math.min(1, max / Math.max(w, h));
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(w * k));
  cv.height = Math.max(1, Math.round(h * k));
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, cv.width, cv.height);
  return cv;
}

export function toJpeg(cv: HTMLCanvasElement, q: number): Promise<Blob> {
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("画像を作れませんでした"))), "image/jpeg", q));
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 写真1枚を、保存用（2000px）とサムネイル（400px）にする。ハッシュは元のファイルで取る（同じ写真の二重登録を防ぐ） */
export async function processBlob(file: Blob): Promise<Processed> {
  const buf = await file.arrayBuffer();
  const [sha256, bmp] = await Promise.all([sha256Hex(buf), decode(file)]);
  const exifTime = readExifDate(buf);
  return fromDrawable(bmp, sha256, exifTime);
}

export async function fromDrawable(src: Drawable, sha256: string, exifTime: number | null): Promise<Processed> {
  const big = scale(src, IMAGE_MAX);
  const image = await toJpeg(big, 0.82);
  const thumb = await toJpeg(scale(big, THUMB_MAX), 0.72);
  return { image, thumb, width: big.width, height: big.height, sha256, exifTime };
}
