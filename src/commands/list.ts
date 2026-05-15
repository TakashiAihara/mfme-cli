import { launch } from "../browser.ts";
import { AppError } from "../errors.ts";
import { fetchTransactions } from "../scraper/transactions.ts";
import { log } from "../log.ts";
import { EXIT } from "../types.ts";

export type ListArgs = {
  since?: string;
  until?: string;
  format: "json" | "ndjson" | "csv";
};

export function toCsvRow(tx: import("../types.ts").Transaction): string {
  const cat = tx.category ? `${tx.category.largeName}/${tx.category.middleName}` : "";
  return [tx.id, tx.date, tx.amount, tx.account, cat, tx.memo ?? "", tx.title]
    .map((v) => `"${String(v).replaceAll('"', '""')}"`)
    .join(",");
}

export async function runList(args: ListArgs): Promise<number> {
  const handle = await launch({ requireSession: true });
  const page = await handle.context.newPage();

  try {
    const txs = await fetchTransactions(page, { since: args.since, until: args.until });
    if (args.format === "ndjson") {
      for (const tx of txs) process.stdout.write(JSON.stringify(tx) + "\n");
    } else if (args.format === "csv") {
      process.stdout.write("id,date,amount,account,category,memo,title\n");
      for (const tx of txs) {
        process.stdout.write(toCsvRow(tx) + "\n");
      }
    } else {
      process.stdout.write(JSON.stringify(txs, null, 2) + "\n");
    }
    return EXIT.OK;
  } catch (e) {
    log.error(e instanceof Error ? e.message : String(e));
    return e instanceof AppError ? e.exitCode : EXIT.UNKNOWN;
  } finally {
    await handle.close();
  }
}
