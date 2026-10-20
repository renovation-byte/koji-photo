import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db, nextProjectNo } from "../db";
import type { Project } from "../model";
import { createProject, currentUserName } from "../store";
import { go, Header, useUi } from "../ui";

type F = Pick<Project, "name" | "customerName" | "address" | "projectNo" | "manager" | "startDate" | "endDate" | "summary">;

/** ③ 案件の登録・編集 */
export function ProjectForm({ id }: { id?: string }) {
  const ui = useUi();
  const existing = useLiveQuery(async () => (id ? await db.projects.get(id) : undefined), [id]);
  const [f, setF] = useState<F | null>(null);
  useEffect(() => {
    if (id && existing && !f) setF({ ...existing });
    if (!id && !f) {
      db.projects.toArray().then((all) =>
        setF({ name: "", customerName: "", address: "", projectNo: nextProjectNo(all.map((p) => p.projectNo), new Date().getFullYear()), manager: currentUserName(), startDate: "", endDate: "", summary: "" }),
      );
    }
  }, [id, existing, f]);
  if (!f) return null;
  const set = (k: keyof F) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.name.trim()) return ui.toast("工事名を入れてください");
    if (id) {
      await db.projects.update(id, { ...f, name: f.name.trim(), updatedAt: Date.now() });
      ui.toast("保存しました");
      go("p/" + id, true);
    } else {
      const p = await createProject(f);
      go("p/" + p.id, true);
    }
  };
  const setDone = async (done: boolean) => {
    if (!id) return;
    if (done && !confirm("この案件を「完了」にします。\n完了から3か月後に、写真は台帳PDFだけを残して整理されます（2週間前に管理者へお知らせ）。よろしいですか？")) return;
    await db.projects.update(id, { status: done ? "done" : "active", doneAt: done ? Date.now() : undefined, updatedAt: Date.now() });
    ui.toast(done ? "完了にしました" : "進行中に戻しました");
  };
  return (
    <>
      <Header title={id ? "案件情報" : "新しい案件"} left={<button className="hbtn" onClick={() => go(id ? "p/" + id : "")}>‹ 戻る</button>} />
      <div className="wrap">
        <div className="card">
          <div className="fld"><label>工事名 *</label><input value={f.name} onChange={set("name")} placeholder="例：田中様邸 浴室改修工事" autoFocus={!id} /></div>
          <div className="g2">
            <div className="fld"><label>お客様名</label><input value={f.customerName} onChange={set("customerName")} placeholder="田中 一郎" /></div>
            <div className="fld"><label>工事番号（自動）</label><input value={f.projectNo} onChange={set("projectNo")} /></div>
          </div>
          <div className="fld"><label>現場住所</label><input value={f.address} onChange={set("address")} /></div>
          <div className="fld"><label>担当者</label><input value={f.manager} onChange={set("manager")} /></div>
          <div className="g2">
            <div className="fld"><label>工事開始日</label><input type="date" value={f.startDate} onChange={set("startDate")} /></div>
            <div className="fld"><label>完了予定日</label><input type="date" value={f.endDate} onChange={set("endDate")} /></div>
          </div>
          <div className="fld"><label>工事概要</label><textarea value={f.summary} onChange={set("summary")} /></div>
          <button className="btn wide" onClick={save}>{id ? "保存" : "登録して写真へ"}</button>
        </div>
        {id && existing && (
          <div className="card">
            <div className="sec">状態：{existing.status === "done" ? "完了" : "進行中"}</div>
            {existing.status === "active" ? (
              <button className="btn sub wide" onClick={() => setDone(true)}>✔ 工事完了にする</button>
            ) : (
              <button className="btn ghost wide" onClick={() => setDone(false)}>進行中に戻す</button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
