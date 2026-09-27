# Labeling Policy

Issue / PR にはこのポリシーに従ってラベルを付与する。`/ta.gh.apply-labels` スキルが本ファイルを読み取って自動付与する。

## Prefix 一覧

### scope/ — 変更範囲（Issue / PR いずれも 1 つ以上、複数可）

- `scope/cli` — `bin/`, commander 配線
- `scope/scraper` — `src/scraper/`（DOM / `POST /cf/fetch` 等）
- `scope/auth` — `login` / session / storageState
- `scope/meta` — カテゴリ ID 同期
- `scope/infra` — `mise` / `bun` / `tsconfig` / CI
- `scope/docs` — README 等のドキュメント

### type/ — 変更種別（1 つ必須）

- `type/enhancement` — 新機能追加・改善
- `type/bug` — バグ修正
- `type/refactoring` — 挙動を変えないリファクタ
- `type/tech-debt` — 技術的負債解消
- `type/documentation` — ドキュメントのみの変更
- `type/test` — テスト追加・修正
- `type/chore` — ビルド・依存・メタ情報
- `type/security` — セキュリティ関連

### priority/ — 優先度（Issue 必須 / PR は任意）

- `priority/critical`
- `priority/high`
- `priority/medium`
- `priority/low`

### effort/ — 作業量目安（Issue 任意）

- `effort/small` — 半日以内
- `effort/medium` — 1–3 日
- `effort/large` — それ以上

### needs/ — 未解決事項（必要時のみ）

- `needs/information` — 追加の情報が必要
- `needs/investigation` — 原因・影響範囲を要調査
- `needs/reproduction` — 再現手順の確認が必要

### status/ — PR ステータス（必要時のみ）

- `status/blocked` — 他の作業待ち
- `status/in-progress` — Draft / 作業途中
- `status/needs-discussion` — 実装前に方針合意が必要
- `status/needs-testing` — 手動・環境での確認待ち
- `status/ready-for-review` — レビュー待ち

### changed/ — labeler による自動付与用（将来）

- `changed/cli`
- `changed/scraper`
- `changed/docs`
- `changed/config`

## デフォルトラベル

`type/` `priority/` `effort/` `status/` `needs/` は claude-config の既定 (delivery-foundation の汎用構成) に揃えている。`bug` / `enhancement` / `documentation` / `question` はそれぞれ `type/bug` / `type/enhancement` / `type/documentation` / `needs/information` に rename 済み。`good first issue` / `help wanted` / `invalid` / `wontfix` / `duplicate` は残すが使わない。

## 運用ルール

- Issue 作成時: `scope/` + `type/` + `priority/` を最低限付ける
- PR 作成時: `scope/` + `type/` を付ける
- `scope/` は複数可
- `/ta.gh.apply-labels` でスキルから一括付与できる
