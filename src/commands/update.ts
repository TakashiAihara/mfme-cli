import { readFile } from "node:fs/promises";
import { launch } from "../browser.ts";
import { AppError } from "../errors.ts";
import { META_FILE } from "../paths.ts";
import { assertAuthenticated } from "../scraper/auth.ts";
import { URL_CF } from "../scraper/urls.ts";
import { resolveCategoryIds, updateTransaction } from "../scraper/update.ts";
import { log } from "../log.ts";
import { EXIT } from "../types.ts";
import type { CategoryMeta } from "../types.ts";

export type UpdateArgs = {
  txId: string;
  memo?: string;
  category?: string;
  dryRun: boolean;
};

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
  } catch (e) {
    log.error(e instanceof Error ? e.message : String(e));
    return e instanceof AppError ? e.exitCode : EXIT.UNKNOWN;
  } finally {
    await handle.close();
  }
}
