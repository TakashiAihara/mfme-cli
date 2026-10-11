import type { Page } from "playwright";
import { AppError } from "../errors.ts";
import { EXIT, type Liability } from "../types.ts";
import { assertAuthenticated } from "./auth.ts";
import { parseYen, readRows, tableHeader, tableToRecords, type RawRow } from "./table.ts";
import { URL_BS_LIABILITY } from "./urls.ts";

const COLUMN = {
  type: "種類",
  name: "名称・説明",
  balance: "残高",
  institution: "保有金融機関",
} as const;

// 明細表が無ければ (行 0 件) 負債 0 件として空配列にする。見出しがあるのに列が欠けていれば
// データ行が無くても止める (0 件に見えて無音で壊れるのを防ぐ)
export function parseLiabilities(rows: RawRow[]): Liability[] {
  if (rows.length === 0) return [];
  const headers = tableHeader(rows);
  for (const col of Object.values(COLUMN)) {
    if (!headers.includes(col)) {
      throw new AppError(`liability table: column "${col}" not found`, EXIT.ELEMENT_NOT_FOUND);
    }
  }
  return tableToRecords(rows).map((r) => ({
    type: r[COLUMN.type] ?? "",
    name: r[COLUMN.name] ?? "",
    balance: parseYen(r[COLUMN.balance] ?? ""),
    institution: r[COLUMN.institution] ?? "",
  }));
}

export async function fetchLiabilities(page: Page): Promise<Liability[]> {
  await page.goto(URL_BS_LIABILITY, { waitUntil: "domcontentloaded" });
  await assertAuthenticated(page);
  if ((await page.$("#bs-liability")) === null) {
    throw new AppError(
      "liability page layout changed: #bs-liability not found",
      EXIT.ELEMENT_NOT_FOUND,
    );
  }
  return parseLiabilities(await readRows(page, "#liability_det table.table-det tr"));
}
