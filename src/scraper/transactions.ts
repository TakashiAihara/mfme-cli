import type { Page } from "playwright";
import type { Transaction } from "../types.ts";

export interface ListOptions {
  since?: string;
  until?: string;
}

function monthCursor(since: Date, until: Date): Array<{ year: number; month: number; from: string }> {
  const out: Array<{ year: number; month: number; from: string }> = [];
  const c = new Date(since.getFullYear(), since.getMonth(), 1);
  while (c <= until) {
    const y = c.getFullYear();
    const m = c.getMonth() + 1;
    out.push({ year: y, month: m, from: `${y}/${String(m).padStart(2, "0")}/01` });
    c.setMonth(c.getMonth() + 1);
  }
  return out;
}

function monthUrl(from: string, month: number, year: number): string {
  const params = new URLSearchParams({ from, month: String(month), year: String(year) });
  return `https://moneyforward.com/cf?${params.toString()}`;
}

export async function fetchTransactions(page: Page, opts: ListOptions): Promise<Transaction[]> {
  const now = new Date();
  const until = opts.until ? new Date(opts.until) : now;
  const since = opts.since ? new Date(opts.since) : new Date(until.getFullYear(), until.getMonth(), 1);
  const months = monthCursor(since, until);

  const results: Transaction[] = [];
  for (const m of months) {
    await page.goto(monthUrl(m.from, m.month, m.year), { waitUntil: "domcontentloaded" });
    await page.waitForSelector("tr.transaction_list, #cf_main_bg", { timeout: 20_000 });
    const rows = await parseRows(page);
    results.push(...rows);
  }
  return filterByDate(results, since, until);
}

async function parseRows(page: Page): Promise<Transaction[]> {
  return await page.$$eval("tr.transaction_list", (trs) =>
    trs.map((tr) => {
      const q = <T extends Element = HTMLElement>(sel: string) => tr.querySelector<T>(sel);
      const idAttr = tr.getAttribute("id") ?? "";
      const id = idAttr.replace(/^js-transaction-/, "");
      const hiddenId = q<HTMLInputElement>('input[name="user_asset_act[id]"]')?.value ?? id;

      const dateAttr = q('td.date')?.getAttribute("data-table-sortable-value") ?? "";
      const dateYmd = dateAttr.split("-")[0] ?? "";
      const isoDate = dateYmd.replaceAll("/", "-");

      const title = (q('td.content span')?.textContent ?? "").trim();
      const amountRaw = (q('td.amount .offset')?.textContent ?? "0").replace(/[^0-9-]/g, "");
      const account = (q('td.note')?.textContent ?? "").trim();
      const largeName = (q('.v_l_ctg')?.textContent ?? "").trim().replace(/\s+/g, " ");
      const middleName = (q('.v_m_ctg')?.textContent ?? "").trim().replace(/\s+/g, " ");
      const largeId = q<HTMLInputElement>('input.h_l_ctg')?.value ?? "";
      const middleId = q<HTMLInputElement>('input.h_m_ctg')?.value ?? "";
      const memo = (q('td.memo .noform span')?.textContent ?? "").trim();
      const isTransfer = tr.classList.contains("transfer") || !!q('.icon-exchange.active');
      const isManualEntry = !!q('input[name="user_asset_act[table_name]"][value="user_manual_cache_act"]');

      return {
        id: hiddenId || id,
        date: isoDate,
        amount: Number(amountRaw) || 0,
        account,
        category: largeName || middleName
          ? { largeId, largeName, middleId, middleName }
          : null,
        memo: memo || null,
        title,
        isTransfer,
        isManualEntry,
      };
    }),
  );
}

function filterByDate(txs: Transaction[], since: Date, until: Date): Transaction[] {
  // until は当日も含めたいので 23:59:59 まで広げる
  const untilEnd = new Date(until.getFullYear(), until.getMonth(), until.getDate(), 23, 59, 59);
  return txs.filter((tx) => {
    const d = new Date(tx.date);
    return d >= since && d <= untilEnd;
  });
}
