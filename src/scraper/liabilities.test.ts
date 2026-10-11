import { describe, expect, test } from "bun:test";
import { AppError } from "../errors.ts";
import { parseLiabilities } from "./liabilities.ts";
import type { RawRow } from "./table.ts";

const th = (text: string) => ({ tag: "th" as const, classes: [], text });
const td = (text: string) => ({ tag: "td" as const, classes: [], text });
const row = (...cells: RawRow["cells"]): RawRow => ({ classes: [], cells });

// /bs/liability の明細表 (#liability_det table.table-det) と同じ列の並び (2026-10-12 に実ページで確認)
const header = row(
  th("種類"),
  th("名称・説明"),
  th("残高"),
  th("保有金融機関"),
  th("変更"),
  th("削除"),
);

describe("parseLiabilities", () => {
  test("明細の行を種類 / 名称 / 残高 / 金融機関にする", () => {
    const rows = [
      header,
      row(
        td("クレジットカード利用残高"),
        td("ご利用残高"),
        td("12,345円"),
        td("A カード"),
        td(""),
        td(""),
      ),
      row(td("奨学金"), td("第一種"), td("1,234,000円"), td("B 機構"), td(""), td("")),
    ];
    expect(parseLiabilities(rows)).toEqual([
      {
        type: "クレジットカード利用残高",
        name: "ご利用残高",
        balance: 12345,
        institution: "A カード",
      },
      { type: "奨学金", name: "第一種", balance: 1234000, institution: "B 機構" },
    ]);
  });

  test("列の並びが変わっても見出しで当てる", () => {
    const rows = [
      row(th("残高"), th("保有金融機関"), th("種類"), th("名称・説明")),
      row(td("700円"), td("C 銀行"), td("ローン"), td("車")),
    ];
    expect(parseLiabilities(rows)).toEqual([
      { type: "ローン", name: "車", balance: 700, institution: "C 銀行" },
    ]);
  });

  test("表が無い (負債 0 件) なら空配列", () => {
    expect(parseLiabilities([])).toEqual([]);
  });

  test("見出しだけでデータ行が無ければ空配列", () => {
    expect(parseLiabilities([header])).toEqual([]);
  });

  for (const missing of ["種類", "名称・説明", "残高", "保有金融機関"]) {
    test(`列 ${missing} が無ければ ELEMENT_NOT_FOUND(2) で列名を出す`, () => {
      const names = ["種類", "名称・説明", "残高", "保有金融機関"].filter((n) => n !== missing);
      const rows = [row(...names.map(th)), row(...names.map(() => td("1円")))];
      let caught: unknown;
      try {
        parseLiabilities(rows);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AppError);
      expect((caught as AppError).exitCode).toBe(2);
      expect((caught as AppError).message).toBe(`liability table: column "${missing}" not found`);
    });
  }
});
