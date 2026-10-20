import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "../db";
import { STATUS_LABEL, type ShootPreset, type ShootStatus, type WorkType } from "../model";
import { fromDrawable, processBlob, sha256Hex } from "../lib/image";
import { addPhoto, getPreset, setPreset, touchProject, updatePhotos } from "../store";
import { go, Sheet, useBlobUrl, useUi } from "../ui";
import { LocationPicker, StatusPicker, useRecentLocations, useWorkTypes, WorkTypePicker } from "../components/pickers";

export function defaultPreset(wts: WorkType[]): ShootPreset {
  return { workTypeId: wts.find((w) => !w.archived)?.id ?? "", location: "", status: "before" };
}

interface Shot {
  id: string;
  thumbUrl: string;
  inLedger: boolean;
  preset: ShootPreset;
}

type Field = "workTypeId" | "location" | "status";

/** ④ 写真撮影（アプリ内カメラ）。シャッターを押すだけで連続撮影し、上の帯の情報を全部の写真に付ける */
export function Camera({ id }: { id: string }) {
  const ui = useUi();
  const project = useLiveQuery(() => db.projects.get(id), [id]);
  const wts = useWorkTypes();
  const recent = useRecentLocations(id);
  const videoRef = useRef<HTMLVideoElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [preset, setP] = useState<ShootPreset | null>(null);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [pending, setPending] = useState(0);
  const [pick, setPick] = useState<Field | null>(null);
  const [ask, setAsk] = useState<{ field: Field; value: string; n: number; label: string } | null>(null);
  const [ghostOn, setGhostOn] = useState(false);
  const [ghostIdx, setGhostIdx] = useState(0);

  // 前回の設定を引き継ぐ
  useEffect(() => {
    if (!wts.length || preset) return;
    getPreset(id).then((p) => setP(p && wts.some((w) => w.id === p.workTypeId) ? p : defaultPreset(wts)));
  }, [id, wts, preset]);

  // カメラを起動
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("このブラウザではアプリ内カメラが使えません");
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        trackRef.current = stream.getVideoTracks()[0];
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play().catch(() => {});
      } catch (e) {
        setCamErr(e instanceof Error && e.name === "NotAllowedError" ? "カメラの使用が許可されていません。ブラウザの設定でカメラを許可するか、「標準カメラ」で撮影してください。" : "アプリ内カメラを起動できませんでした。「標準カメラ」で撮影してください。");
      }
    })();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
    };
  }, []);

  // 施工前の写真（同じ施工箇所）を透かして撮る
  const ghosts = useLiveQuery(
    async () => {
      if (!preset || preset.status === "before" || !preset.location) return [];
      const ps = await db.photos.where("projectId").equals(id).filter((p) => !p.deletedAt && p.status === "before" && p.location === preset.location).toArray();
      return ps.sort((a, b) => b.takenAt - a.takenAt);
    },
    [id, preset?.status, preset?.location],
    [],
  ) ?? [];
  const ghost = ghosts.length ? ghosts[ghostIdx % ghosts.length] : undefined;
  const ghostUrl = useBlobUrl(ghostOn ? ghost?.image : undefined);

  const savePreset = useCallback((p: ShootPreset) => { setP(p); setPreset(id, p); }, [id]);

  const enqueue = (job: () => Promise<void>) => {
    setPending((n) => n + 1);
    queue.current = queue.current.then(job).catch(() => ui.toast("保存できなかった写真があります")).finally(() => setPending((n) => n - 1));
  };

  const keep = async (p: ShootPreset, data: Awaited<ReturnType<typeof fromDrawable>>, source: "camera" | "album") => {
    const ph = await addPhoto(id, p, data, source);
    if (!ph) return;
    setShots((s) => [...s, { id: ph.id, thumbUrl: URL.createObjectURL(data.thumb), inLedger: true, preset: p }]);
  };

  const shoot = async () => {
    const v = videoRef.current;
    if (!v || !preset || !v.videoWidth) return;
    const p = { ...preset };
    const fl = flashRef.current;
    if (fl) { fl.style.opacity = "0.7"; setTimeout(() => (fl.style.opacity = "0"), 90); }
    navigator.vibrate?.(30);
    // フレームを今すぐ写し取ってから、保存は後ろで順番に
    const cv = document.createElement("canvas");
    cv.width = v.videoWidth;
    cv.height = v.videoHeight;
    cv.getContext("2d")!.drawImage(v, 0, 0);
    const track = trackRef.current;
    const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto(): Promise<Blob> } }).ImageCapture;
    const still = IC && track ? new IC(track).takePhoto().catch(() => null) : Promise.resolve(null);
    const t = Date.now();
    enqueue(async () => {
      const blob = await still;
      let data;
      if (blob) {
        data = await processBlob(blob);
        data.exifTime = t;
      } else {
        const d = await fromDrawable(cv, "", t);
        d.sha256 = await sha256Hex(await d.image.arrayBuffer());
        data = d;
      }
      await keep(p, data, "camera");
    });
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length || !preset) return;
    const p = { ...preset };
    for (const f of [...files]) {
      enqueue(async () => {
        const data = await processBlob(f);
        if (!data.exifTime) data.exifTime = Date.now();
        await keep(p, data, "camera");
      });
    }
  };

  // 帯を切り替えるとき「さっき撮った N 枚もこの○○にしますか？」
  const change = (field: Field, value: string) => {
    if (!preset) return;
    setPick(null);
    const old = preset[field];
    if (old === value) return;
    let n = 0;
    for (let i = shots.length - 1; i >= 0 && shots[i].preset[field] === old; i--) n++;
    const next = { ...preset, [field]: value } as ShootPreset;
    savePreset(next);
    setGhostIdx(0);
    if (n > 0) {
      const label = field === "workTypeId" ? wts.find((w) => w.id === value)?.name ?? "" : field === "status" ? STATUS_LABEL[value as ShootStatus] : value || "（なし）";
      setAsk({ field, value, n, label });
    }
  };
  const applyAsk = async () => {
    if (!ask) return;
    const target = shots.slice(-ask.n);
    await updatePhotos(target.map((s) => s.id), { [ask.field]: ask.value });
    setShots((s) => s.map((x) => (target.includes(x) ? { ...x, preset: { ...x.preset, [ask.field]: ask.value } } : x)));
    ui.toast(`${ask.n}枚を「${ask.label}」にしました`);
    setAsk(null);
  };

  const toggleLedger = async (s: Shot) => {
    await updatePhotos([s.id], { inLedger: !s.inLedger });
    setShots((all) => all.map((x) => (x.id === s.id ? { ...x, inLedger: !x.inLedger } : x)));
  };

  const finish = async () => {
    await queue.current;
    await touchProject(id);
    shots.forEach((s) => URL.revokeObjectURL(s.thumbUrl));
    go("p/" + id, true);
  };

  if (!preset || !project) return <div className="cam" />;
  const wtName = wts.find((w) => w.id === preset.workTypeId)?.name ?? "（工種）";

  return (
    <div className="cam">
      <div className="cam-top">
        <button className="tag" onClick={() => setPick("workTypeId")}><small>工種</small><b>{wtName}</b></button>
        <button className="tag" onClick={() => setPick("location")}><small>施工箇所</small><b>{preset.location || "未設定"}</b></button>
        <button className="tag" onClick={() => setPick("status")} style={{ flex: "0 0 74px" }}><small>状況</small><b>{STATUS_LABEL[preset.status]}</b></button>
      </div>
      <div className="cam-view">
        <video ref={videoRef} playsInline muted autoPlay />
        {ghostUrl && <img className="ghost" src={ghostUrl} alt="" />}
        <div className="flash" ref={flashRef} />
        {camErr && <div style={{ position: "absolute", padding: 24, textAlign: "center", lineHeight: 1.8, fontSize: 14 }}>{camErr}</div>}
        {pending > 0 && <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.6)", borderRadius: 10, padding: "3px 9px", fontSize: 12 }}>保存中 {pending}</div>}
      </div>
      <div className="cam-strip">
        {shots.length === 0 && <span style={{ fontSize: 12, color: "#c9d3e6", padding: "0 6px" }}>撮った写真はここに並びます。要らない写真はタップで台帳から外せます。</span>}
        {shots.map((s) => (
          <button key={s.id} className={s.inLedger ? "" : "off"} style={{ backgroundImage: `url(${s.thumbUrl})` }} onClick={() => toggleLedger(s)} aria-label={s.inLedger ? "台帳に使う" : "台帳に使わない"}>
            <i>{s.inLedger ? "✓" : "✕"}</i>
          </button>
        ))}
      </div>
      <div className="cam-bot">
        <button className="cbtn" onClick={finish}>完了<br /><small>{shots.length}枚</small></button>
        {camErr ? (
          <button className="shutter" style={{ background: "#c9a961" }} onClick={() => fileRef.current?.click()} aria-label="標準カメラで撮影" />
        ) : (
          <button className="shutter" onClick={shoot} aria-label="撮影" />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ghosts.length > 0 && (
            <button className={"cbtn" + (ghostOn ? " on" : "")} onClick={() => (ghostOn && ghosts.length > 1 ? setGhostIdx((i) => i + 1) : setGhostOn(!ghostOn))} onDoubleClick={() => setGhostOn(false)}>
              {ghostOn ? (ghosts.length > 1 ? `透かし ${(ghostIdx % ghosts.length) + 1}/${ghosts.length}` : "透かし ON") : "施工前を透かす"}
            </button>
          )}
          {ghostOn && <button className="cbtn" onClick={() => setGhostOn(false)}>透かし OFF</button>}
          <button className="cbtn" onClick={() => fileRef.current?.click()}>標準カメラ</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      </div>
      {pick === "workTypeId" && <WorkTypePicker value={preset.workTypeId} onClose={() => setPick(null)} onPick={(v) => change("workTypeId", v)} />}
      {pick === "location" && <LocationPicker value={preset.location} recent={recent} onClose={() => setPick(null)} onPick={(v) => change("location", v)} />}
      {pick === "status" && <StatusPicker value={preset.status} onClose={() => setPick(null)} onPick={(v) => change("status", v)} />}
      {ask && (
        <Sheet title="さっき撮った写真" onClose={() => setAsk(null)}>
          <p style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 14 }}>直前に撮った <b>{ask.n}枚</b> も「<b>{ask.label}</b>」にしますか？</p>
          <div className="row">
            <button className="btn" style={{ flex: 1, padding: 16 }} onClick={applyAsk}>はい、{ask.n}枚も直す</button>
            <button className="btn sub" style={{ flex: 1, padding: 16 }} onClick={() => setAsk(null)}>いいえ</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

