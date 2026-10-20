// データの形。クラウド（Supabase）の表と同じ形にしておき、段階2でそのまま送れるようにする。

export type Role = "admin" | "member" | "partner";
export type ShootStatus = "before" | "during" | "after" | "done" | "other";

export const STATUS_LABEL: Record<ShootStatus, string> = {
  before: "施工前",
  during: "施工中",
  after: "施工後",
  done: "完成",
  other: "その他",
};
export const STATUS_ORDER: ShootStatus[] = ["before", "during", "after", "done", "other"];

export const DEFAULT_WORK_TYPES = [
  "仮設工事", "解体工事", "基礎工事", "木工事", "屋根工事", "外壁工事", "金属工事", "左官工事",
  "防水工事", "塗装工事", "内装工事", "建具工事", "電気設備工事", "給排水衛生設備工事",
  "住宅設備工事", "外構工事", "完成写真", "その他",
];

// 施工箇所の候補（階 × 部屋）。自由入力もできる。
export const FLOORS = ["1階", "2階", "3階", "外部", "屋根", "床下", "小屋裏"];
export const ROOMS = [
  "リビング", "ダイニング", "キッチン", "和室", "洋室", "寝室", "子供部屋", "廊下", "階段", "玄関",
  "浴室", "洗面所", "トイレ", "収納", "納戸", "バルコニー",
  "外壁北面", "外壁南面", "外壁東面", "外壁西面", "屋根", "基礎", "外構", "駐車場",
];

export interface Company {
  id: string;
  code: string;
  name: string;
  logo?: Blob;
  updatedAt: number;
}

export interface WorkType {
  id: string;
  companyId: string;
  name: string;
  sortOrder: number;
  archived: boolean;
  updatedAt: number;
}

export interface Project {
  id: string;
  companyId: string;
  projectNo: string;
  name: string;
  customerName: string;
  address: string;
  manager: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  summary: string;
  status: "active" | "done";
  doneAt?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
  deletedAt?: number;
}

export interface DateEdit {
  from: number;
  to: number;
  by: string;
  at: number;
}

export interface Photo {
  id: string; // 端末で発番（送信の重複を防ぐ）
  companyId: string;
  projectId: string;
  workTypeId: string;
  location: string;
  status: ShootStatus;
  takenAt: number;
  takenAtOriginal: number; // 写真の記録の日時（直しても残す）
  dateEdits: DateEdit[];
  description: string;
  note: string; // 社内メモ。台帳には載せない
  inLedger: boolean;
  sortOrder: number;
  image: Blob; // 長辺2000px
  thumb: Blob; // 長辺400px
  width: number;
  height: number;
  sha256: string;
  source: "camera" | "album";
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  syncState: "local" | "uploading" | "synced";
}

export type LedgerSort = "location" | "workType" | "date" | "status";
export interface LedgerSettings {
  projectId: string;
  layout: 2 | 3 | 4;
  sort: LedgerSort;
  showCover: boolean;
  updatedAt: number;
}

export interface ShootPreset {
  workTypeId: string;
  location: string;
  status: ShootStatus;
}

export const TRASH_DAYS = 30;
export const DAY = 86400000;

export function newId(prefix = ""): string {
  const r = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix + r;
}
