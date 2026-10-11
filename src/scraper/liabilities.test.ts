import { describe, expect, test } from "bun:test";
import { AppError } from "../errors.ts";
import { fetchLiabilities, parseLiabilities } from "./liabilities.ts";
import type { RawRow } from "./table.ts";

const th = (text: string) => ({ tag: "th" as const, classes: [], text });
const td = (text: string) => ({ tag: "td" as const, classes: [], text });
const row = (...cells: RawRow["cells"]): RawRow => ({ classes: [], cells });

// /bs/liability の明細表 (#liability_det table.table-det) と同じ列の並び (2026-10-11 に実ページで確認)
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

  test("行が 1 つも無ければ見出し無しとして ELEMENT_NOT_FOUND(2)", () => {
    let caught: unknown;
    try {
      parseLiabilities([]);
    } catch (e) {
      caught = e;
    }
    expect((caught as AppError).exitCode).toBe(2);
    expect((caught as AppError).message).toBe("table header not found");
  });

  test("見出しだけの表でも列が欠けていれば ELEMENT_NOT_FOUND(2)", () => {
    expect(() => parseLiabilities([row(th("種類"), th("名称・説明"), th("残高"))])).toThrow(
      'liability table: column "保有金融機関" not found',
    );
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

describe("fetchLiabilities", () => {
  // Playwright の Page のうち fetchLiabilities が触る口だけを持つ偽物
  function fakePage(opts: { url?: string; table: boolean; rows?: RawRow[] }) {
    const calls: string[] = [];
    const page = {
      goto: async (u: string) => {
        calls.push(`goto ${u}`);
      },
      url: () => opts.url ?? "https://moneyforward.com/bs/liability",
      $: async (sel: string) => {
        calls.push(`$ ${sel}`);
        return opts.table ? {} : null;
      },
      $$eval: async (sel: string) => {
        calls.push(`$$eval ${sel}`);
        return opts.rows ?? [];
      },
    };
    return { page: page as unknown as Parameters<typeof fetchLiabilities>[0], calls };
  }

  test("明細表の行を読んで変換する", async () => {
    const rows = [header, row(td("奨学金"), td("第一種"), td("10円"), td("B"), td(""), td(""))];
    const { page, calls } = fakePage({ table: true, rows });

    expect(await fetchLiabilities(page)).toEqual([
      { type: "奨学金", name: "第一種", balance: 10, institution: "B" },
    ]);
    expect(calls).toEqual([
      "goto https://moneyforward.com/bs/liability",
      "$ #liability_det table.table-det",
      "$$eval #liability_det table.table-det tr",
    ]);
  });

  test("明細表が見つからなければ 0 件にせず ELEMENT_NOT_FOUND(2)", async () => {
    const { page } = fakePage({ table: false });
    let caught: unknown;
    try {
      await fetchLiabilities(page);
    } catch (e) {
      caught = e;
    }
    expect((caught as AppError).exitCode).toBe(2);
    expect((caught as AppError).message).toBe(
      "liability table not found: #liability_det table.table-det",
    );
  });

  test("ログイン画面に飛ばされたら AUTH_FAILED(1)", async () => {
    const { page } = fakePage({ table: true, url: "https://moneyforward.com/sign_in" });
    let caught: unknown;
    try {
      await fetchLiabilities(page);
    } catch (e) {
      caught = e;
    }
    expect((caught as AppError).exitCode).toBe(1);
  });
});
