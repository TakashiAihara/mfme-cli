import type { Page } from "playwright";
import { AppError } from "../errors.ts";
import { EXIT, type CategoryMeta } from "../types.ts";
import { fetchMonthIntoDom, openCf } from "./transactions.ts";

const ROW_CATEGORY = "tr.transaction_list .v_l_ctg";

// 行を探して遡る上限。1 年分どの月にも明細が無い口座は、カテゴリを読む元が無いとみなして止める
const LOOKBACK_MONTHS = 12;

// today の前月から n か月分の /cf/fetch の from ("YYYY/M/1") を新しい順に返す
export function pastMonths(today: Date, n: number): string[] {
  const base = today.getFullYear() * 12 + today.getMonth();
  return Array.from({ length: n }, (_, i) => {
    const k = base - (i + 1);
    return `${Math.floor(k / 12)}/${(k % 12) + 1}/1`;
  });
}

// カテゴリの一覧は取引行のドロップダウンからしか開けないので、行のある月を DOM に載せる。
// 当月が 0 件の月初は /cf に行が無い (#67)
async function ensureRow(page: Page, today: Date): Promise<void> {
  if ((await page.$$(ROW_CATEGORY)).length > 0) return;
  for (const from of pastMonths(today, LOOKBACK_MONTHS)) {
    await fetchMonthIntoDom(page, from);
    if ((await page.$$(ROW_CATEGORY)).length > 0) return;
  }
  throw new AppError(
    `no transactions in the last ${LOOKBACK_MONTHS} months to read categories from`,
    EXIT.ELEMENT_NOT_FOUND,
  );
}

export async function fetchCategoryMeta(page: Page, today = new Date()): Promise<CategoryMeta> {
  await openCf(page);
  await ensureRow(page, today);

  // 既存の取引行の大項目ドロップダウンをクリックすると
  // 全大項目 (l_c_name) と各配下の中項目 (sub_menu > m_c_name) が一括描画される
  await page.click(ROW_CATEGORY);
  // サーバーからの async 描画待ち
  await page.waitForFunction(() => document.querySelectorAll("a.l_c_name").length > 0, undefined, {
    timeout: 10_000,
  });

  const data = await page.evaluate(() => {
    const large = Array.from(document.querySelectorAll<HTMLAnchorElement>("a.l_c_name")).map(
      (a) => ({
        id: a.getAttribute("id") ?? "",
        name: (a.textContent ?? "").trim(),
      }),
    );

    const middle: Array<{ id: string; name: string; largeId: string }> = [];
    document.querySelectorAll<HTMLUListElement>("ul.sub_menu").forEach((ul) => {
      const largeId = ul.getAttribute("id") ?? "";
      ul.querySelectorAll<HTMLAnchorElement>("a.m_c_name").forEach((a) => {
        const id = a.getAttribute("id") ?? "";
        const name = (a.textContent ?? "").trim();
        if (id && name) middle.push({ id, name, largeId });
      });
    });

    return { large, middle };
  });

  return {
    large: data.large.filter((l) => l.id && l.name),
    middle: data.middle,
    updatedAt: new Date().toISOString(),
  };
}
