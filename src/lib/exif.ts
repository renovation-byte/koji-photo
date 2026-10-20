// JPEG の EXIF から撮影日時（DateTimeOriginal）を読む。読めなければ null。
export function readExifDate(buf: ArrayBuffer): number | null {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    if ((marker & 0xff00) !== 0xff00) return null;
    const len = v.getUint16(off + 2);
    if (marker === 0xffe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966) {
      return parseTiff(v, off + 10, Math.min(v.byteLength, off + 2 + len));
    }
    if (marker === 0xffda) return null;
    off += 2 + len;
  }
  return null;
}

function parseTiff(v: DataView, base: number, end: number): number | null {
  if (base + 8 > end) return null;
  const le = v.getUint16(base) === 0x4949;
  const u16 = (o: number) => v.getUint16(o, le);
  const u32 = (o: number) => v.getUint32(o, le);
  const ifd = (o: number, want: number[]): Record<number, number> => {
    const out: Record<number, number> = {};
    if (o + 2 > end) return out;
    const n = u16(o);
    for (let i = 0; i < n; i++) {
      const e = o + 2 + i * 12;
      if (e + 12 > end) break;
      const tag = u16(e);
      if (want.includes(tag)) out[tag] = e;
    }
    return out;
  };
  const str = (entry: number) => {
    const cnt = u32(entry + 4);
    const p = cnt > 4 ? base + u32(entry + 8) : entry + 8;
    let s = "";
    for (let i = 0; i < cnt && p + i < end; i++) {
      const c = v.getUint8(p + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const ifd0 = ifd(base + u32(base + 4), [0x8769, 0x0132]);
  let s = "";
  if (ifd0[0x8769] !== undefined) {
    const exif = ifd(base + u32(ifd0[0x8769] + 8), [0x9003, 0x9004]);
    if (exif[0x9003] !== undefined) s = str(exif[0x9003]);
    else if (exif[0x9004] !== undefined) s = str(exif[0x9004]);
  }
  if (!s && ifd0[0x0132] !== undefined) s = str(ifd0[0x0132]);
  return parseExifDateString(s);
}

/** "2026:10:20 14:05:33" → 端末の時刻（ローカル時刻として解釈） */
export function parseExifDateString(s: string): number | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s || "");
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const t = d.getTime();
  return isNaN(t) || +m[1] < 1990 ? null : t;
}
