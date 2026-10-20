import { db, ensureCompany, kvGet, kvSet, nextProjectNo } from "./db";
import type { Photo, Project, ShootPreset } from "./model";
import { DAY, newId, TRASH_DAYS } from "./model";
import { processBlob, type Processed } from "./lib/image";

/** いまの利用者の名前。同じサイトの見積アプリにログイン中なら、その名前を使う（段階2で本当のログインに置き換える） */
export function currentUserName(): string {
  try {
    const s = JSON.parse(localStorage.getItem("shinsan_login_v1") || "null");
    if (s && s.name) return String(s.name);
  } catch {
    /* なし */
  }
  try {
    return localStorage.getItem("koji_user_name") || "";
  } catch {
    return "";
  }
}

export async function createProject(input: Partial<Project>): Promise<Project> {
  const c = await ensureCompany();
  const all = await db.projects.toArray();
  const now = Date.now();
  const p: Project = {
    id: newId("pj_"),
    companyId: c.id,
    projectNo: input.projectNo?.trim() || nextProjectNo(all.map((x) => x.projectNo), new Date().getFullYear()),
    name: input.name?.trim() || "",
    customerName: input.customerName?.trim() || "",
    address: input.address?.trim() || "",
    manager: input.manager?.trim() ?? currentUserName(),
    startDate: input.startDate || "",
    endDate: input.endDate || "",
    summary: input.summary || "",
    status: "active",
    createdBy: currentUserName(),
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
  };
  await db.projects.add(p);
  return p;
}

export async function touchProject(id: string) {
  await db.projects.update(id, { lastUsedAt: Date.now() });
}

export async function getPreset(projectId: string): Promise<ShootPreset | null> {
  return kvGet<ShootPreset | null>("preset:" + projectId, null);
}
export async function setPreset(projectId: string, p: ShootPreset) {
  await kvSet("preset:" + projectId, p);
}

/** 写真を1枚登録する。同じ案件に同じ写真（ハッシュが同じ）があれば登録しない（null を返す） */
export async function addPhoto(
  projectId: string,
  preset: ShootPreset,
  data: Processed,
  source: "camera" | "album",
  shotAt?: number,
): Promise<Photo | null> {
  const dup = await db.photos.where("[projectId+sha256]").equals([projectId, data.sha256]).first();
  if (dup && !dup.deletedAt) return null;
  const pj = await db.projects.get(projectId);
  if (!pj) throw new Error("案件が見つかりません");
  const now = Date.now();
  const t = data.exifTime ?? shotAt ?? now;
  const p: Photo = {
    id: dup ? dup.id : newId("ph_"),
    companyId: pj.companyId,
    projectId,
    workTypeId: preset.workTypeId,
    location: preset.location,
    status: preset.status,
    takenAt: t,
    takenAtOriginal: t,
    dateEdits: [],
    description: "",
    note: "",
    inLedger: true,
    sortOrder: 0,
    image: data.image,
    thumb: data.thumb,
    width: data.width,
    height: data.height,
    sha256: data.sha256,
    source,
    createdBy: currentUserName(),
    createdAt: now,
    updatedAt: now,
    syncState: "local",
  };
  await db.photos.put(p);
  await db.projects.update(projectId, { updatedAt: now, lastUsedAt: now });
  requestPersist();
  return p;
}

export async function importFiles(projectId: string, preset: ShootPreset, files: File[], onEach?: (i: number) => void) {
  let added = 0, dup = 0, bad = 0;
  for (let i = 0; i < files.length; i++) {
    onEach?.(i);
    try {
      const data = await processBlob(files[i]);
      const r = await addPhoto(projectId, preset, data, "album", files[i].lastModified || undefined);
      if (r) added++;
      else dup++;
    } catch {
      bad++;
    }
  }
  return { added, dup, bad };
}

/** 写真をまとめて直す。撮影日を変えたら履歴を残す */
export async function updatePhotos(ids: string[], patch: Partial<Photo>) {
  const now = Date.now(), by = currentUserName();
  await db.transaction("rw", db.photos, async () => {
    for (const id of ids) {
      const p = await db.photos.get(id);
      if (!p) continue;
      const next: Partial<Photo> = { ...patch, updatedAt: now, syncState: "local" };
      if (patch.takenAt !== undefined && patch.takenAt !== p.takenAt) {
        next.dateEdits = [...(p.dateEdits || []), { from: p.takenAt, to: patch.takenAt, by, at: now }];
      }
      await db.photos.update(id, next);
    }
  });
}

/** 削除＝ゴミ箱へ（30日は戻せる） */
export async function trashPhotos(ids: string[]) {
  await updatePhotos(ids, { deletedAt: Date.now() });
}
export async function restorePhotos(ids: string[]) {
  const now = Date.now();
  await db.transaction("rw", db.photos, async () => {
    for (const id of ids) {
      const p = await db.photos.get(id);
      if (!p) continue;
      delete p.deletedAt;
      p.updatedAt = now;
      p.syncState = "local";
      await db.photos.put(p);
    }
  });
}
/** ゴミ箱で30日を過ぎた写真を消す（起動時） */
export async function purgeTrash(now = Date.now()) {
  const old = await db.photos.filter((p) => !!p.deletedAt && now - p.deletedAt! > TRASH_DAYS * DAY).primaryKeys();
  if (old.length) await db.photos.bulkDelete(old);
  return old.length;
}

let persistAsked = false;
function requestPersist() {
  if (persistAsked) return;
  persistAsked = true;
  try {
    navigator.storage?.persist?.();
  } catch {
    /* なし */
  }
}
