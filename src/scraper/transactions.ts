import type { Page } from "playwright";
import type { Transaction } from "../types.ts";
import { URL_CF, urlCfForMonth } from "./urls.ts";

export interface ListOptions {
  since?: string;
  until?: string;
}

function monthsBetween(since?: string, until?: string): string[] {
  const now = new Date();
  const end = until ? new Date(until) : now;
  const start = since ? new Date(since) : new Date(end.getFullYear(), end.getMonth(), 1);
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const m = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    months.push(m);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months.length ? months : [`${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}`];
}

export async function fetchTransactions(page: Page, opts: ListOptions): Promise<Transaction[]> {
  const months = monthsBetween(opts.since, opts.until);
  const results: Transaction[] = [];
  for (const ym of months) {
    await page.goto(urlCfForMonth(ym), { waitUntil: "domcontentloaded" });
    await page.waitForSelector("table.cf-detail-table, table#cf-detail-table, table", { timeout: 15_000 });
    const rows = await parsePage(page);
    results.push(...rows);
  }
  return filterByDate(results, opts);
}

async function parsePage(page: Page): Promise<Transaction[]> {
  return await page.evaluate(() => {
    const out: Transaction[] = [];
    const rows = document.querySelectorAll<HTMLTableRowElement>("table tbody tr.transaction_list");
    rows.forEach((tr) => {
      const id = tr.getAttribute("id") ?? tr.dataset["id"] ?? "";
      const dateText = tr.querySelector<HTMLElement>(".date, td.date")?.innerText?.trim() ?? "";
      const amountText = tr.querySelector<HTMLElement>(".amount, td.amount")?.innerText?.replace(/[^0-9-]/g, "") ?? "0";
      const account = tr.querySelector<HTMLElement>(".account, td.account")?.innerText?.trim() ?? "";
      const title = tr.querySelector<HTMLElement>(".content, td.content")?.innerText?.trim() ?? "";
      const largeName = tr.querySelector<HTMLElement>(".lctg-name, .l_c_name")?.innerText?.trim() ?? "";
      const middleName = tr.querySelector<HTMLElement>(".mctg-name, .m_c_name")?.innerText?.trim() ?? "";
      const memo = tr.querySelector<HTMLElement>(".memo, td.memo")?.innerText?.trim() ?? "";
      const isTransfer = tr.classList.contains("transfer") || /振替/.test(title);
      const isManualEntry = tr.classList.contains("manual") || tr.querySelector(".manual-entry") !== null;

      out.push({
        id: id.replace(/^js-transaction-/, ""),
        date: dateText,
        amount: Number(amountText) || 0,
        account,
        category: largeName || middleName ? {
          largeId: "",
          largeName,
          middleId: "",
          middleName,
        } : null,
        memo: memo || null,
        title,
        isTransfer,
        isManualEntry,
      });
    });
    return out;
  });
}

function filterByDate(txs: Transaction[], opts: ListOptions): Transaction[] {
  const since = opts.since ? new Date(opts.since) : null;
  const until = opts.until ? new Date(opts.until) : null;
  return txs.filter((tx) => {
    const d = new Date(tx.date);
    if (since && d < since) return false;
    if (until && d > until) return false;
    return true;
  });
}
