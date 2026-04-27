import type { Page } from "playwright";
import type { Transaction } from "../types.ts";

export type ListOptions = {
  since?: string;
  until?: string;
};

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthCursor(since: string, until: string): Array<{ from: string }> {
  const [sy, sm] = since.split("-").map(Number) as [number, number];
  const [uy, um] = until.split("-").map(Number) as [number, number];
  const out: Array<{ from: string }> = [];
  let y = sy;
  let m = sm;
  while (y < uy || (y === uy && m <= um)) {
    out.push({ from: `${y}/${m}/1` });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export async function fetchTransactions(page: Page, opts: ListOptions): Promise<Transaction[]> {
  const untilStr = opts.until ?? todayYmd();
  const since = opts.since ?? `${untilStr.slice(0, 7)}-01`;
  const months = monthCursor(since, untilStr);

  // 初回に /cf を開いて CSRF token / jQuery / list_body を確立
  await page.goto("https://moneyforward.com/cf", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("tr.transaction_list", { timeout: 20_000 });

  const results: Transaction[] = [];
  for (const m of months) {
    await fetchMonthIntoDom(page, m.from);
    const rows = await parseRows(page);
    results.push(...rows);
  }
  return filterByDate(results, since, untilStr);
}

// POST /cf/fetch はサーバ側で「選択月」を切り替えつつ JS を返し、
// それを eval することで `.list_body` に対象月の行が差し込まれる。
async function fetchMonthIntoDom(page: Page, from: string): Promise<void> {
  const ok = await page.evaluate(async (fromDate) => {
    const token = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? "";
    const body = new URLSearchParams({ from: fromDate, service_id: "", account_id_hash: "" });
    const res = await fetch("/cf/fetch", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "X-CSRF-Token": token,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "text/javascript, application/javascript, */*; q=0.01",
      },
      body: body.toString(),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const text = await res.text();
    // eslint-disable-next-line no-eval
    (0, eval)(text);
    return { ok: true, status: res.status };
  }, from);
  if (!ok.ok) {
    throw new Error(`/cf/fetch failed: HTTP ${ok.status} (from=${from})`);
  }
}

async function parseRows(page: Page): Promise<Transaction[]> {
  return await page.$$eval("tr.transaction_list", (trs) =>
    trs.map((tr) => {
      const q = <T extends Element = HTMLElement>(sel: string) => tr.querySelector<T>(sel);
      const idAttr = tr.getAttribute("id") ?? "";
      const id = idAttr.replace(/^js-transaction-/, "");
      const hiddenId = q<HTMLInputElement>('input[name="user_asset_act[id]"]')?.value ?? id;

      const dateAttr = q("td.date")?.getAttribute("data-table-sortable-value") ?? "";
      const dateYmd = dateAttr.split("-")[0] ?? "";
      const isoDate = dateYmd.replaceAll("/", "-");

      const title = (q("td.content span")?.textContent ?? "").trim();
      const amountRaw = (q("td.amount .offset")?.textContent ?? "0").replace(/[^0-9-]/g, "");
      const account = (q("td.note")?.textContent ?? "").trim();
      const largeName = (q(".v_l_ctg")?.textContent ?? "").trim().replace(/\s+/g, " ");
      const middleName = (q(".v_m_ctg")?.textContent ?? "").trim().replace(/\s+/g, " ");
      const largeId = q<HTMLInputElement>("input.h_l_ctg")?.value ?? "";
      const middleId = q<HTMLInputElement>("input.h_m_ctg")?.value ?? "";
      const memo = (q("td.memo .noform span")?.textContent ?? "").trim();
      const isTransfer = tr.classList.contains("transfer") || !!q(".icon-exchange.active");
      const isManualEntry = !!q(
        'input[name="user_asset_act[table_name]"][value="user_manual_cache_act"]',
      );

      return {
        id: hiddenId || id,
        date: isoDate,
        amount: Number(amountRaw) || 0,
        account,
        category: largeName || middleName ? { largeId, largeName, middleId, middleName } : null,
        memo: memo || null,
        title,
        isTransfer,
        isManualEntry,
      };
    }),
  );
}

function filterByDate(txs: Transaction[], since: string, until: string): Transaction[] {
  return txs.filter((tx) => tx.date >= since && tx.date <= until);
}
