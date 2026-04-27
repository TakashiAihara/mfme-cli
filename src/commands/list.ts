import { launch } from "../browser.ts";
import { fetchTransactions } from "../scraper/transactions.ts";
import { log } from "../log.ts";
import { EXIT } from "../types.ts";

export type ListArgs = {
  since?: string;
  until?: string;
  format: "json" | "ndjson" | "csv";
};

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
        const cat = tx.category ? `${tx.category.largeName}/${tx.category.middleName}` : "";
        const row = [tx.id, tx.date, tx.amount, tx.account, cat, tx.memo ?? "", tx.title]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(",");
        process.stdout.write(row + "\n");
      }
    } else {
      process.stdout.write(JSON.stringify(txs, null, 2) + "\n");
    }
    return EXIT.OK;
  } catch (e) {
    log.error(e instanceof Error ? e.message : String(e));
    return EXIT.ELEMENT_NOT_FOUND;
  } finally {
    await handle.close();
  }
}
