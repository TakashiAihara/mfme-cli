import { describe, expect, test } from "bun:test";
import { AppError } from "../errors.ts";
import { parseYen, tableToRecords, type RawRow } from "./table.ts";

const th = (text: string) => ({ tag: "th" as const, classes: [], text });
const td = (text: string, ...classes: string[]) => ({ tag: "td" as const, classes, text });
const row = (...cells: RawRow["cells"]): RawRow => ({ classes: [], cells });

function caught(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    return e as AppError;
  }
  throw new Error("did not throw");
}

describe("tableToRecords", () => {
  test("見出し行の文字列をキーにして、データ行を 1 件ずつ record にする", () => {
    const rows = [
      row(th("種類"), th("残高"), th("変更")),
      row(td("カード"), td("1,200円"), td("×")),
      row(td("奨学金"), td("35,000円"), td("")),
    ];
    expect(tableToRecords(rows)).toEqual([
      { 種類: "カード", 残高: "1,200円", 変更: "×" },
      { 種類: "奨学金", 残高: "35,000円", 変更: "" },
    ]);
  });

  test("見出しは空白をすべて除き、セルは前後を落として内部の連続した空白を 1 つにする", () => {
    const rows = [row(th(" 名称・\n 説明 ")), row(td("  ご利用\n   残高  "))];
    expect(tableToRecords(rows)).toEqual([{ "名称・説明": "ご利用 残高" }]);
  });

  test("見出しより前の行は捨て、セルが足りない行は空文字で埋める", () => {
    const rows = [row(td("前置き")), row(th("A"), th("B")), row(td("a1"))];
    expect(tableToRecords(rows)).toEqual([{ A: "a1", B: "" }]);
  });

  test("見出しの後に来る th だけの行 (小見出し) は record にしない", () => {
    const rows = [row(th("A")), row(th("小見出し")), row(td("a1"))];
    expect(tableToRecords(rows)).toEqual([{ A: "a1" }]);
  });

  test("見出し行が無ければ ELEMENT_NOT_FOUND(2)", () => {
    const e = caught(() => tableToRecords([row(td("x"))]));
    expect(e).toBeInstanceOf(AppError);
    expect(e.exitCode).toBe(2);
    expect(e.message).toBe("table header not found");
  });
});

describe("parseYen", () => {
  test("桁区切りと円を外して整数にする", () => {
    expect(parseYen("1,234,567円")).toBe(1234567);
    expect(parseYen(" 0円 ")).toBe(0);
  });

  test("負の値 (超過した残り / マイナス残高) を受ける", () => {
    expect(parseYen("-3,450円")).toBe(-3450);
  });

  test("円が無くても数字だけなら受ける", () => {
    expect(parseYen("8,800")).toBe(8800);
  });

  for (const bad of ["", "円", "---", "1.5円", "abc円", "1,2a3円", "9,007,199,254,740,993円"]) {
    test(`金額でない ${JSON.stringify(bad)} は ELEMENT_NOT_FOUND(2)`, () => {
      const e = caught(() => parseYen(bad));
      expect(e).toBeInstanceOf(AppError);
      expect(e.exitCode).toBe(2);
      expect(e.message).toBe(`unexpected amount: ${JSON.stringify(bad)}`);
    });
  }
});
