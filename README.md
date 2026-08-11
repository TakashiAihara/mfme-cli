# mfme-cli

Unofficial CLI for Moneyforward ME. Automates the web UI via Playwright so you
can fetch transactions as JSON and tweak memo / category per record from the
terminal. Intended to be piped into Claude Code skills and other tooling.

> Use at your own risk. This tool operates the Moneyforward ME web UI as a
> signed-in user. Automated access is your own responsibility.

## Stack

- Bun + TypeScript
- Playwright (Chromium) for UI automation
- commander for CLI parsing

## Install

Runtime は `mise` で管理します (`.mise.toml` に Bun のバージョンをピン留め)。

```sh
mise trust           # 初回のみ
mise install         # Bun インストール
bun install
bun run install-browsers   # Playwright Chromium
```

## Commands

```sh
mfme login                          # headed ログイン -> storageState 保存
mfme sync-meta                      # カテゴリ ID マップをキャッシュ
mfme list [--since 2026-01-01] [--until 2026-04-01] [--format json|ndjson|csv]
mfme update <tx_id> [--memo "..."] [--category "食費/ランチ"] [--dry-run]
mfme update --stdin [--dry-run]     # NDJSON を stdin から受けて一括更新
```

### 一括更新 (`--stdin`)

`update` は 1 件ごとにブラウザを起動するため複数件だと時間がかかる。`--stdin` は
NDJSON を受け取り、**ブラウザ起動 1 回で全件**を処理する。

入力は 1 行 1 レコードの JSON:

```json
{"txId":"1883329387533828352","category":"食費/カフェ","memo":"スタバ"}
```

| フィールド | 必須 | 内容 |
| --- | --- | --- |
| `txId` | 必須 | 取引 ID (空文字不可) |
| `category` | `memo` とどちらか必須 | `大項目/中項目` 形式の文字列 |
| `memo` | `category` とどちらか必須 | メモ本文 |

- 未知のフィールドは無視するので、`list` の出力に列が増えても壊れない
- `null` は「未指定」として扱う (`list --format ndjson` の `memo: null` をそのまま流せる)
- 空行はスキップする
- `--stdin` と `tx_id` / `--memo` / `--category` は併用不可
- `category` を含む行がある場合は、事前に `mfme sync-meta` が必要

出力は 1 件 1 行の NDJSON。**1 件失敗しても止まらず全件処理する**:

```json
{"ok":true,"txId":"1883329387533828352"}
{"ok":false,"txId":"1883329387533762816","error":"update failed: HTTP 500"}
{"ok":false,"txId":null,"error":"line 4: invalid JSON (...)"}
```

`--dry-run` は書き込まずにプランだけを NDJSON で出す:

```json
{"dryRun":true,"txId":"1883329387533828352","payload":{"largeCategoryId":"11","middleCategoryId":"43"}}
```

exit code は全件成功で `0`、1 件でも失敗すれば `4`。どの行が失敗したかは stdout の
NDJSON で判別する。進捗は stderr に出る。

「1 件失敗しても止まらない」のは**行ごとのデータ不備**に対してであり、実行前提が
欠けている場合は 1 行も書かずに中断する。以下は例外:

| 状況 | 挙動 | exit code |
| --- | --- | --- |
| `category` 行があるのに meta 未取得 (`mfme sync-meta` 未実行) | **全体を中断**。1 行も適用せず、行ごとの結果も出さない | `3` |
| stdin が空 / 有効な行が 0 件 | 全体を中断 | `3` |
| セッション切れ / 未ログイン (`mfme login` が必要) | 全体を中断 | `1` |
| 適用対象が 1 件も無い (全行がパース・カテゴリ解決で失敗) | ブラウザを起動せず、行ごとの失敗理由だけ出力 | `4` |

meta 欠落を行ごとの失敗にしていないのは、復旧手段が `mfme sync-meta` の 1 つしか
無いため。中途半端に memo 行だけ適用してから再実行を促すより、何も書かずに止める方が
状態を追いやすい。

### 出力規約

- stdout: JSON / NDJSON / CSV (skill がパイプで受ける)
- stderr: 進捗ログ (`[info] ...` / `[error] ...`)
- exit code: `0` 成功 / `1` 認証失敗 / `2` 要素見つからない / `3` 入力不正 / `4` その他
  (`update --stdin` は 1 件でも失敗すれば `4`)

### ストレージ

| 種類 | パス |
| --- | --- |
| セッション | `$XDG_CONFIG_HOME/mfme/session.json` (default `~/.config/mfme/session.json`) |
| メタ (カテゴリ ID) | `$XDG_CONFIG_HOME/mfme/meta.json` |
| ログ | `$XDG_STATE_HOME/mfme/mfme.log` |

セッションファイルは `0600`、親ディレクトリは `0700` で作成します。

## 想定ワークフロー

```sh
# 1. 取引を JSON で取得
mfme list --since 2026-01-01 > /tmp/tx.json

# 2. Claude などに投げて推奨カテゴリを得る
cat /tmp/tx.json | claude -p "未分類取引に推奨カテゴリを付けて"

# 3. 提案を dry-run で確認
mfme update tx_123 --category "食費/ランチ" --dry-run

# 4. 実適用
mfme update tx_123 --category "食費/ランチ" --memo "ラーメン"
```

複数件まとめて付ける場合は `--stdin` を使う (ブラウザ起動は 1 回):

```sh
# list -> 推奨カテゴリ付与 -> 一括適用
mfme list --since 2026-01-01 --format ndjson \
  | jq -c '{txId: .id, category: "食費/カフェ"}' \
  | mfme update --stdin --dry-run    # まず dry-run で確認

mfme list --since 2026-01-01 --format ndjson \
  | jq -c '{txId: .id, category: "食費/カフェ"}' \
  | mfme update --stdin > result.ndjson
```

### memo の追記

`memo` は常に上書きなので、追記したい場合は `list` で取得した現在の値に足してから流す。
`--stdin` は NDJSON を受けるだけなので、この組み立ては `jq` 側で完結する。

```sh
mfme list --since 2026-01-01 --format ndjson \
  | jq -c '{txId: .id, memo: ((.memo // "") + " 追記テキスト")}' \
  | mfme update --stdin
```

`memo` が未設定の取引は `list` の出力で `null` になるので `// ""` で空文字に落とす。
先頭の余分なスペースが気になる場合は `| ltrimstr(" ")` を挟む。

読んでから書くまでの間に ME 側で memo が変わっていると、その変更は上書きされる。

## 制約

1. 連携口座取引は読み取り・メモ/カテゴリ編集のみ。金額/日付は不変。
2. 手動口座（現金等）は本 CLI の範囲外（本バージョンは CRUD しない）。
3. MFA が有効でも初回 `mfme login` を headed で通過すれば以降は storageState で headless 実行可能。
4. Moneyforward ME 側の DOM / API 変更で壊れる可能性あり。

## ライセンス

MIT
