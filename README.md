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
```

### 出力規約

- stdout: JSON / NDJSON / CSV (skill がパイプで受ける)
- stderr: 進捗ログ (`[info] ...` / `[error] ...`)
- exit code: `0` 成功 / `1` 認証失敗 / `2` 要素見つからない / `3` 入力不正 / `4` その他

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

## 制約

1. 連携口座取引は読み取り・メモ/カテゴリ編集のみ。金額/日付は不変。
2. 手動口座（現金等）は本 CLI の範囲外（本バージョンは CRUD しない）。
3. MFA が有効でも初回 `mfme login` を headed で通過すれば以降は storageState で headless 実行可能。
4. Moneyforward ME 側の DOM / API 変更で壊れる可能性あり。

## ライセンス

MIT
