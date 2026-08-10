import { readFile } from "node:fs/promises";
import { launch } from "../browser.ts";
import { AppError } from "../errors.ts";
import { META_FILE } from "../paths.ts";
import { assertAuthenticated } from "../scraper/auth.ts";
import { URL_CF } from "../scraper/urls.ts";
import { resolveCategoryIds, updateTransaction } from "../scraper/update.ts";
import type { UpdatePayload } from "../scraper/update.ts";
import { log } from "../log.ts";
import { EXIT } from "../types.ts";
import type { CategoryMeta, ExitCode } from "../types.ts";

export type UpdateArgs = {
  txId: string;
  memo?: string;
  category?: string;
  dryRun: boolean;
};

export type UpdateBatchArgs = {
  dryRun: boolean;
};

// NDJSON 1 行のパース結果。カテゴリはまだ ID に解決していない
export type ParsedLine =
  | { ok: true; txId: string; memo?: string; category?: string }
  | { ok: false; txId: string | null; error: string };

// カテゴリ解決まで済んだ 1 行。ok:false はそのまま結果として出力する
export type BatchEntry =
  | { ok: true; txId: string; payload: UpdatePayload }
  | { ok: false; txId: string | null; error: string };

// stdout に 1 件 1 行で書く NDJSON レコード
export type BatchResult =
  | { ok: true; txId: string }
  | { ok: false; txId: string | null; error: string };

async function loadMeta(): Promise<CategoryMeta> {
  try {
    return JSON.parse(await readFile(META_FILE, "utf8")) as CategoryMeta;
  } catch {
    throw new AppError(
      `meta not found. run \`mfme sync-meta\` first (${META_FILE})`,
      EXIT.INVALID_INPUT,
    );
  }
}

export async function runUpdate(args: UpdateArgs): Promise<number> {
  try {
    if (!args.memo && !args.category) {
      log.error("--memo か --category のどちらかは必須です");
      return EXIT.INVALID_INPUT;
    }

    const payload: { memo?: string; largeCategoryId?: string; middleCategoryId?: string } = {};
    if (args.memo !== undefined) payload.memo = args.memo;
    if (args.category) {
      const meta = await loadMeta();
      const { largeCategoryId, middleCategoryId } = resolveCategoryIds(meta, args.category);
      payload.largeCategoryId = largeCategoryId;
      payload.middleCategoryId = middleCategoryId;
    }

    const plan = { txId: args.txId, payload };

    if (args.dryRun) {
      process.stdout.write(JSON.stringify({ dryRun: true, ...plan }, null, 2) + "\n");
      return EXIT.OK;
    }

    const handle = await launch({ requireSession: true });
    const page = await handle.context.newPage();
    try {
      await page.goto(URL_CF, { waitUntil: "domcontentloaded" });
      await assertAuthenticated(page);
      await updateTransaction(page, args.txId, payload);
      process.stdout.write(JSON.stringify({ ok: true, ...plan }, null, 2) + "\n");
      return EXIT.OK;
    } finally {
      await handle.close();
    }
  } catch (e) {
    log.error(e instanceof Error ? e.message : String(e));
    return e instanceof AppError ? e.exitCode : EXIT.UNKNOWN;
  }
}

function parseUpdateLine(line: string, lineNo: number): ParsedLine {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, txId: null, error: `line ${lineNo}: invalid JSON (${detail})` };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, txId: null, error: `line ${lineNo}: expected a JSON object` };
  }

  const record = parsed as Record<string, unknown>;
  const txId = record["txId"];
  if (typeof txId !== "string" || !txId) {
    return { ok: false, txId: null, error: `line ${lineNo}: txId is required (non-empty string)` };
  }

  // list --format ndjson の memo は null、category はオブジェクトで出る。
  // null は「未指定」として扱い、オブジェクトは 大項目/中項目 文字列への変換漏れとして弾く
  const rawMemo = record["memo"];
  if (rawMemo !== undefined && rawMemo !== null && typeof rawMemo !== "string") {
    return { ok: false, txId, error: `line ${lineNo}: memo must be a string` };
  }

  const rawCategory = record["category"];
  if (rawCategory !== undefined && rawCategory !== null && typeof rawCategory !== "string") {
    return { ok: false, txId, error: `line ${lineNo}: category must be "大項目/中項目" string` };
  }

  const memo = typeof rawMemo === "string" ? rawMemo : undefined;
  const category = typeof rawCategory === "string" ? rawCategory : undefined;

  if (!memo && !category) {
    return { ok: false, txId, error: `line ${lineNo}: memo か category のどちらかは必須です` };
  }

  return {
    ok: true,
    txId,
    ...(memo !== undefined ? { memo } : {}),
    ...(category ? { category } : {}),
  };
}

export function parseUpdateLines(input: string): ParsedLine[] {
  const lines: ParsedLine[] = [];

  const rawLines = input.split("\n");
  for (let i = 0; i < rawLines.length; i++) {
    const line = (rawLines[i] ?? "").trim();
    if (!line) continue;
    lines.push(parseUpdateLine(line, i + 1));
  }

  return lines;
}

export function resolveBatchEntries(lines: ParsedLine[], meta: CategoryMeta | null): BatchEntry[] {
  return lines.map((line): BatchEntry => {
    if (!line.ok) return line;

    const payload: UpdatePayload = {};
    if (line.memo !== undefined) payload.memo = line.memo;

    if (line.category) {
      if (!meta) {
        return {
          ok: false,
          txId: line.txId,
          error: `meta not found. run \`mfme sync-meta\` first (${META_FILE})`,
        };
      }
      try {
        const { largeCategoryId, middleCategoryId } = resolveCategoryIds(meta, line.category);
        payload.largeCategoryId = largeCategoryId;
        payload.middleCategoryId = middleCategoryId;
      } catch (e) {
        return { ok: false, txId: line.txId, error: e instanceof Error ? e.message : String(e) };
      }
    }

    return { ok: true, txId: line.txId, payload };
  });
}

// 1 件失敗しても止めずに全件流す。apply は page 使い回しの updateTransaction を想定
export async function applyBatchEntries(
  entries: BatchEntry[],
  apply: (txId: string, payload: UpdatePayload) => Promise<void>,
  onResult: (result: BatchResult, index: number, total: number) => void,
): Promise<BatchResult[]> {
  const results: BatchResult[] = [];

  for (const [index, entry] of entries.entries()) {
    let result: BatchResult;

    if (!entry.ok) {
      result = entry;
    } else {
      try {
        await apply(entry.txId, entry.payload);
        result = { ok: true, txId: entry.txId };
      } catch (e) {
        result = { ok: false, txId: entry.txId, error: e instanceof Error ? e.message : String(e) };
      }
    }

    results.push(result);
    onResult(result, index, entries.length);
  }

  return results;
}

export function batchExitCode(results: Array<{ ok: boolean }>): ExitCode {
  return results.some((r) => !r.ok) ? EXIT.UNKNOWN : EXIT.OK;
}

export async function runUpdateBatch(args: UpdateBatchArgs): Promise<number> {
  try {
    if (process.stdin.isTTY) {
      log.error(
        "--stdin は NDJSON を stdin から受け取ります (ex: cat plan.ndjson | mfme update --stdin)",
      );
      return EXIT.INVALID_INPUT;
    }

    const lines = parseUpdateLines(await Bun.stdin.text());
    if (lines.length === 0) {
      log.error("stdin に処理対象の行がありません");
      return EXIT.INVALID_INPUT;
    }

    const meta = lines.some((line) => line.ok && line.category) ? await loadMeta() : null;
    const entries = resolveBatchEntries(lines, meta);

    if (args.dryRun) {
      for (const entry of entries) {
        const record = entry.ok
          ? { dryRun: true, txId: entry.txId, payload: entry.payload }
          : entry;
        process.stdout.write(JSON.stringify(record) + "\n");
      }
      return batchExitCode(entries);
    }

    log.info(`${entries.length} 行を処理します (ブラウザ起動は 1 回)`);

    const handle = await launch({ requireSession: true });
    const page = await handle.context.newPage();
    try {
      await page.goto(URL_CF, { waitUntil: "domcontentloaded" });
      await assertAuthenticated(page);

      const results = await applyBatchEntries(
        entries,
        (txId, payload) => updateTransaction(page, txId, payload),
        (result, index, total) => {
          process.stdout.write(JSON.stringify(result) + "\n");
          const progress = `(${index + 1}/${total}) ${result.txId ?? "-"}`;
          if (result.ok) log.info(`${progress} ok`);
          else log.warn(`${progress} failed: ${result.error}`);
        },
      );

      return batchExitCode(results);
    } finally {
      await handle.close();
    }
  } catch (e) {
    log.error(e instanceof Error ? e.message : String(e));
    return e instanceof AppError ? e.exitCode : EXIT.UNKNOWN;
  }
}
