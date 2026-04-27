#!/usr/bin/env bun
import { Command } from "commander";
import { runLogin } from "../src/commands/login.ts";
import { runList } from "../src/commands/list.ts";
import { runUpdate } from "../src/commands/update.ts";
import { runSyncMeta } from "../src/commands/sync-meta.ts";

const program = new Command();

program.name("mfme").description("Unofficial Moneyforward ME CLI (UI automation)").version("0.1.0");

program
  .command("login")
  .description("headed ブラウザでログインし storageState を保存")
  .action(async () => {
    process.exit(await runLogin());
  });

program
  .command("list")
  .description("取引一覧を取得して stdout に出力")
  .option("--since <YYYY-MM-DD>", "開始日 (inclusive)")
  .option("--until <YYYY-MM-DD>", "終了日 (inclusive)")
  .option("--format <format>", "json|ndjson|csv", "json")
  .action(async (opts: { since?: string; until?: string; format?: string }) => {
    const format = (opts.format ?? "json") as "json" | "ndjson" | "csv";
    if (!["json", "ndjson", "csv"].includes(format)) {
      process.stderr.write(`invalid --format: ${format}\n`);
      process.exit(3);
    }
    process.exit(await runList({ since: opts.since, until: opts.until, format }));
  });

program
  .command("update")
  .argument("<tx_id>", "取引 ID (tx_xxx)")
  .description("メモ / カテゴリを更新")
  .option("--memo <text>", "メモ本文")
  .option("--category <大項目/中項目>", "カテゴリ (ex: 食費/ランチ)")
  .option("--dry-run", "プランを出力するだけで書き込まない", false)
  .action(async (txId: string, opts: { memo?: string; category?: string; dryRun?: boolean }) => {
    process.exit(
      await runUpdate({
        txId,
        memo: opts.memo,
        category: opts.category,
        dryRun: !!opts.dryRun,
      }),
    );
  });

program
  .command("sync-meta")
  .description("カテゴリ ID マップを取得してキャッシュ")
  .action(async () => {
    process.exit(await runSyncMeta());
  });

await program.parseAsync(process.argv);
