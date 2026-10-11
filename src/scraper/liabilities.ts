import type { Page } from "playwright";
import { AppError } from "../errors.ts";
import { EXIT, type Liability } from "../types.ts";
import { assertAuthenticated } from "./auth.ts";
import { parseYen, readRows, tableHeader, tableToRecords, type RawRow } from "./table.ts";
import { URL_BS_LIABILITY } from "./urls.ts";

const LIABILITY_TABLE = "#liability_det table.table-det";

const COLUMN = {
  type: "種類",
  name: "名称・説明",
  balance: "残高",
  institution: "保有金融機関",
} as const;

// 見出しがあるのに列が欠けていれば、データ行が無くても止める (0 件に見えて無音で壊れるのを防ぐ)
export function parseLiabilities(rows: RawRow[]): Liability[] {
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
  // 負債 0 件のときに明細表が出るかは確かめていない。表が見つからないのを 0 件と読むと、
  // 画面の作りが変わったときに空の結果で成功してしまうので、表が無ければ止める
  if ((await page.$(LIABILITY_TABLE)) === null) {
    throw new AppError(`liability table not found: ${LIABILITY_TABLE}`, EXIT.ELEMENT_NOT_FOUND);
  }
  return parseLiabilities(await readRows(page, `${LIABILITY_TABLE} tr`));
}
