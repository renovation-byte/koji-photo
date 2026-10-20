# CLAUDE.md（koji-photo）

工事写真台帳アプリ。React＋TypeScript＋Vite＋PWA。仕様の正は `obsidian-notes` の「工事写真台帳アプリ/確定仕様書｜工事写真台帳アプリ.md」。仕様を変えるときは、先にユーザーに確認し、仕様書も直す。

## 最重要
- **現場での操作回数を減らす**。撮影の流れに確認や入力を足すときは、タップが増えないかを先に考える。
- **写真を消さない**：撮影したら必ず先に端末（IndexedDB）へ保存する。段階2以降、クラウドへの送信が完了したことを確認するまで端末から消さない。削除はゴミ箱（30日）。
- 台帳とPDFは `src/lib/render.ts` の同じ描画で作る（プレビューとPDFの見た目を一致させる）。写真は縦横比を保ち、トリミングしない。

## 構成
- `src/db.ts`：端末内の保存（Dexie）。クラウドの表と同じ形（`company_id`・端末で発番するID）にしてある
- `src/store.ts`：登録・編集・ゴミ箱。撮影日を手で直したら `dateEdits` に履歴を残す
- `src/lib/ledger.ts`（並び・定型文・ページの寸法）、`render.ts`（ページを描く）、`pdf.ts`（pdf-lib。文字と枠はページ画像、写真は別に重ねる）
- `src/screens/`：Home（ダッシュボード・案件一覧）、ProjectForm、ProjectDetail（写真一覧）、Camera、Ledger、Settings

## 確認
- `npm test` と `npm run build`（型チェック込み）を通してからコミットする。
- 画面の確認は Playwright（`/opt/pw-browsers/chromium`、カメラは `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`）で、412px幅で横にはみ出さないこと。
- コンテナでは日本語のダウンロード名が「download」になる（LANG未設定のため）。`LANG=C.UTF-8` で確認する。

## まだやっていないこと（段階2以降）
- クラウド（Supabase：新しいプロジェクト）・ログイン（見積アプリのIDを同じサイトで読んで登録）・同期・再試行
- ドラッグでの並び替え・台帳上での説明の編集・まとめてダウンロード
- 完了3か月後の整理（2週間前に管理者へ通知）・協力業者・他社の登録
