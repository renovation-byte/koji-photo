import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// ---- 画面の切り替え（#/〜） ----
export function useRoute(): string[] {
  const get = () => (location.hash.replace(/^#\/?/, "") || "").split("/").filter(Boolean).map(decodeURIComponent);
  const [r, setR] = useState(get);
  useEffect(() => {
    const f = () => setR(get());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return r;
}
export function go(path: string, replace = false) {
  const h = "#/" + path.replace(/^\//, "");
  if (replace) location.replace(h);
  else location.hash = h;
}

// ---- お知らせ・処理中 ----
interface UiCtx {
  toast: (m: string) => void;
  busy: (m: string | null, ratio?: number) => void;
}
const Ctx = createContext<UiCtx>({ toast: () => {}, busy: () => {} });
export const useUi = () => useContext(Ctx);

export function UiProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<string | null>(null);
  const [b, setB] = useState<{ m: string; r?: number } | null>(null);
  const v = useMemo<UiCtx>(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return {
      toast: (m) => {
        setT(m);
        clearTimeout(timer);
        timer = setTimeout(() => setT(null), 2600);
      },
      busy: (m, r) => setB(m === null ? null : { m, r }),
    };
  }, []);
  return (
    <Ctx.Provider value={v}>
      {children}
      {t && <div className="toast" role="status">{t}</div>}
      {b && (
        <div className="busy">
          <div>{b.m}</div>
          {b.r !== undefined && <div className="bar"><i style={{ width: `${Math.round(b.r * 100)}%` }} /></div>}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function Header({ title, sub, left, right }: { title: string; sub?: string; left?: ReactNode; right?: ReactNode }) {
  return (
    <div className="hdr">
      {left}
      <div className="t"><b>{title}</b>{sub && <span>{sub}</span>}</div>
      {right}
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="sheet-h"><b>{title}</b><button className="x" onClick={onClose} aria-label="閉じる">✕</button></div>
        {children}
      </div>
    </div>
  );
}

/** Blob を画像のURLにする（使い終わったら片付ける） */
export function useBlobUrl(b?: Blob | null): string | undefined {
  const url = useMemo(() => (b ? URL.createObjectURL(b) : undefined), [b]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

export function Thumb({ blob, alt = "" }: { blob?: Blob; alt?: string }) {
  const u = useBlobUrl(blob);
  return <img src={u} alt={alt} loading="lazy" />;
}
