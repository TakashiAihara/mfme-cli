import { launch } from "../browser.ts";
import { AppError } from "../errors.ts";
import { fetchTransactions } from "../scraper/transactions.ts";
import { log } from "../log.ts";
import { EXIT, type Transaction } from "../types.ts";

export type ListFilter = {
  account?: string;
  transfer: boolean;
  uncategorized: boolean;
  minAmount?: number;
  maxAmount?: number;
};

export type ListArgs = {
  since?: string;
  until?: string;
  format: "json" | "ndjson" | "csv";
  filter: ListFilter;
};

export function toCsvRow(tx: Transaction): string {
  const cat = tx.category ? `${tx.category.largeName}/${tx.category.middleName}` : "";
  return [tx.id, tx.date, tx.amount, tx.account, cat, tx.memo ?? "", tx.title]
    .map((v) => `"${String(v).replaceAll('"', '""')}"`)
    .join(",");
}

// ME では「未分類」が大項目 id "0" の実在カテゴリ (sync-meta の large に載る) なので、
// 未分類の行は null ではなく id "0" で来る。名前ではなく id で見る
function isUncategorized(tx: Transaction): boolean {
  return tx.category === null || tx.category.largeId === "0";
}

export type ListFilterOptions = {
  account?: string;
  transfer?: boolean;
  uncategorized?: boolean;
  minAmount?: string;
  maxAmount?: string;
};

// 金額は円の整数。Number() だと "0x10" や "1e3" や空文字 (0) まで通るので形で絞る
function parseAmount(flag: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  if (!/^-?\d+$/.test(raw)) throw new AppError(`invalid ${flag}: ${raw}`, EXIT.INVALID_INPUT);
  return Number(raw);
}

export function toListFilter(o: ListFilterOptions): ListFilter {
  const minAmount = parseAmount("--min-amount", o.minAmount);
  const maxAmount = parseAmount("--max-amount", o.maxAmount);
  if (minAmount !== undefined && maxAmount !== undefined && minAmount > maxAmount) {
    throw new AppError("--min-amount が --max-amount より大きい", EXIT.INVALID_INPUT);
  }
  return {
    account: o.account,
    transfer: o.transfer ?? true,
    uncategorized: !!o.uncategorized,
    minAmount,
    maxAmount,
  };
}

export function filterTransactions(txs: Transaction[], f: ListFilter): Transaction[] {
  return txs.filter((tx) => {
    if (f.account !== undefined && !tx.account.includes(f.account)) return false;
    if (!f.transfer && tx.isTransfer) return false;
    if (f.uncategorized && !isUncategorized(tx)) return false;
    if (f.minAmount !== undefined && tx.amount < f.minAmount) return false;
    if (f.maxAmount !== undefined && tx.amount > f.maxAmount) return false;
    return true;
  });
}

export async function runList(args: ListArgs): Promise<number> {
  try {
    const handle = await launch({ requireSession: true });
    try {
      const page = await handle.context.newPage();
      const txs = filterTransactions(
        await fetchTransactions(page, { since: args.since, until: args.until }),
        args.filter,
      );
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
    } finally {
      await handle.close();
    }
  } catch (e) {
    log.error(e instanceof Error ? e.message : String(e));
    return e instanceof AppError ? e.exitCode : EXIT.UNKNOWN;
  }
}
