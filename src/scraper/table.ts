import type { Page } from "playwright";
import { AppError } from "../errors.ts";
import { EXIT } from "../types.ts";

export type RawCell = { tag: "th" | "td"; classes: string[]; text: string };
export type RawRow = { classes: string[]; cells: RawCell[] };

// ブラウザ内では DOM を読むだけにし、解釈は Node 側の純関数に任せてテストできるようにする
export async function readRows(page: Page, rowSelector: string): Promise<RawRow[]> {
  return await page.$$eval(rowSelector, (trs) =>
    trs.map((tr) => ({
      classes: Array.from(tr.classList),
      cells: Array.from(tr.children)
        .filter((el) => el.tagName === "TH" || el.tagName === "TD")
        .map((el) => ({
          tag: el.tagName.toLowerCase() as "th" | "td",
          classes: Array.from(el.classList),
          text: el.textContent ?? "",
        })),
    })),
  );
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function headerIndex(rows: RawRow[]): number {
  return rows.findIndex((r) => r.cells.length > 0 && r.cells.every((c) => c.tag === "th"));
}

export function tableHeader(rows: RawRow[]): string[] {
  const i = headerIndex(rows);
  if (i < 0) throw new AppError("table header not found", EXIT.ELEMENT_NOT_FOUND);
  // 見出しは列を当てる鍵なので、改行や字間の空白で一致しなくならないよう空白をすべて除く
  return rows[i]!.cells.map((c) => c.text.replace(/\s+/g, ""));
}

export function tableToRecords(rows: RawRow[]): Array<Record<string, string>> {
  const headers = tableHeader(rows);
  return rows
    .slice(headerIndex(rows) + 1)
    .filter((r) => r.cells.some((c) => c.tag === "td"))
    .map((r) => Object.fromEntries(headers.map((h, j) => [h, normalize(r.cells[j]?.text ?? "")])));
}

// 金額は円の整数。Number() だと "1e3" や "0x10" が通り、桁が多いと丸められるので形と安全な範囲で絞る
export function parseYen(text: string): number {
  const digits = text.replace(/\s+/g, "").replace(/,/g, "").replace(/円$/, "");
  const value = Number(digits);
  if (!/^-?\d+$/.test(digits) || !Number.isSafeInteger(value)) {
    throw new AppError(`unexpected amount: ${JSON.stringify(text)}`, EXIT.ELEMENT_NOT_FOUND);
  }
  return value;
}
