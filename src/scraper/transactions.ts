import type { Page } from "playwright";
import { AppError } from "../errors.ts";
import { EXIT, type Transaction } from "../types.ts";
import { assertAuthenticated } from "./auth.ts";
import { URL_CF } from "./urls.ts";

export type ListOptions = {
  since?: string;
  until?: string;
};

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monthCursor(since: string, until: string): Array<{ from: string }> {
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

  await openCf(page);

  const results: Transaction[] = [];
  for (const m of months) {
    await fetchMonthIntoDom(page, m.from);
    const rows = await parseRows(page);
    results.push(...rows);
  }
  return filterByDate(results, since, untilStr);
}

// /cf を開いて CSRF token / jQuery / .list_body を確立する。.list_body も jQuery も
// サーバの HTML に入っているので DOMContentLoaded で揃う (2026-11-01 確認)。
// 行 (tr.transaction_list) は待たない。当月が 0 件の月初は行が 1 本も無く、行を待つと過去月も取れなくなる
async function openCf(page: Page): Promise<void> {
  await page.goto(URL_CF, { waitUntil: "domcontentloaded" });
  await assertAuthenticated(page);
  // .list_body が無いのは画面の作りが変わったときか、同じホストの保守・エラー画面に着いたとき。
  // 0 件として返すと空の結果で成功してしまうので止める
  if ((await page.$(".list_body")) === null) {
    throw new AppError("transaction list (.list_body) not found on /cf", EXIT.ELEMENT_NOT_FOUND);
  }
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
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    if (!contentType.includes("javascript") || !text.includes("list_body")) {
      return { ok: false, error: `unexpected response (content-type: ${contentType})` };
    }
    // ME の /cf/fetch は jQuery で .list_body を書き換える JS を返す。
    // HTML パース不要で DOM 更新できる唯一の手段として eval を使用。
    (0, eval)(text);
    return { ok: true, error: null };
  }, from);
  if (!ok.ok) {
    throw new Error(`/cf/fetch failed: ${ok.error} (from=${from})`);
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

export function filterByDate(txs: Transaction[], since: string, until: string): Transaction[] {
  return txs.filter((tx) => tx.date >= since && tx.date <= until);
}
