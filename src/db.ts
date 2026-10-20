import Dexie, { type Table } from "dexie";
import type { Company, LedgerSettings, Photo, Project, WorkType } from "./model";
import { DEFAULT_WORK_TYPES, newId } from "./model";

export interface KV {
  key: string;
  value: unknown;
}

// 端末内の保存（IndexedDB）。段階1はここだけで完結する。
class KojiDB extends Dexie {
  companies!: Table<Company, string>;
  workTypes!: Table<WorkType, string>;
  projects!: Table<Project, string>;
  photos!: Table<Photo, string>;
  ledgers!: Table<LedgerSettings, string>;
  kv!: Table<KV, string>;

  constructor(name = "kojiPhoto") {
    super(name);
    this.version(1).stores({
      companies: "id, code",
      workTypes: "id, companyId, sortOrder",
      projects: "id, companyId, updatedAt, lastUsedAt, projectNo",
      photos: "id, projectId, [projectId+sha256], takenAt, deletedAt, syncState",
      ledgers: "projectId",
      kv: "key",
    });
  }
}

export let db = new KojiDB();
/** テスト用：別名のDBに切り替える */
export function useTestDb(name: string) {
  db = new KojiDB(name);
  return db;
}

export async function kvGet<T>(key: string, def: T): Promise<T> {
  const r = await db.kv.get(key);
  return r ? (r.value as T) : def;
}
export async function kvSet(key: string, value: unknown) {
  await db.kv.put({ key, value });
}

/** 最初の起動で、端末の会社（段階1はこの端末だけの仮の会社）と工種を用意する */
export async function ensureCompany(): Promise<Company> {
  const all = await db.companies.toArray();
  if (all.length) return all[0];
  const c: Company = { id: newId("co_"), code: "local", name: "", updatedAt: Date.now() };
  await db.transaction("rw", db.companies, db.workTypes, async () => {
    await db.companies.add(c);
    await db.workTypes.bulkAdd(
      DEFAULT_WORK_TYPES.map((name, i) => ({
        id: newId("wt_"), companyId: c.id, name, sortOrder: i, archived: false, updatedAt: Date.now(),
      })),
    );
  });
  return c;
}

/** 工事番号の自動採番：その年の最大の番号＋1（例 2026-0001） */
export function nextProjectNo(existing: string[], year: number): string {
  let max = 0;
  const re = new RegExp("^" + year + "-(\\d+)$");
  for (const n of existing) {
    const m = re.exec(n.trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${year}-${String(max + 1).padStart(4, "0")}`;
}
