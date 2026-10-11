import { describe, expect, test } from "bun:test";
import { AppError } from "../errors.ts";
import { fetchBudget, monthOffset, parseBudget, toBudgetLines } from "./budget.ts";
import type { RawRow } from "./table.ts";

const th = (text: string) => ({ tag: "th" as const, classes: [], text });
const td = (text: string, cls: string) => ({ tag: "td" as const, classes: [cls], text });
const r = (classes: string[], ...cells: RawRow["cells"]): RawRow => ({ classes, cells });
const line = (classes: string[], name: string, spent: string, remaining: string) =>
  r(classes, th(name), td(spent, "amount"), td(remaining, "remaining"));

function caught(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    return e as AppError;
  }
  throw new Error("did not throw");
}

// #budgets-progress table の行の class と並び (2026-10-11 に実ページで確認)
const rows: RawRow[] = [
  r(["budget_header"], th(""), th("使った金額"), th("残り使える金額")),
  r(["budget_sub_header"], th(""), th("今月残り20日")),
  line(["total_expense"], "支出全体", "150,000円", "50,000円"),
  line(
    ["budget_type_total_expense", "variable_type"],
    "手元で管理するお金",
    "60,000円",
    "-1,000円",
  ),
  line(["large_category_expense"], "食費", "40,000円", "-1,000円"),
  line(["large_category_expense"], "日用品", "20,000円", "0円"),
  line(["budget_type_total_expense", "fixed_type"], "毎月決まった支出", "90,000円", "51,000円"),
  line(["large_category_expense"], "住宅", "90,000円", "51,000円"),
];

describe("parseBudget", () => {
  test("支出全体・変動費・固定費と大項目に分け、budget は使った金額 + 残り", () => {
    expect(parseBudget(rows, "2026/09")).toEqual({
      month: "2026-09",
      total: { spent: 150000, remaining: 50000, budget: 200000 },
      groups: [
        {
          kind: "variable",
          total: { spent: 60000, remaining: -1000, budget: 59000 },
          categories: [
            { largeName: "食費", spent: 40000, remaining: -1000, budget: 39000 },
            { largeName: "日用品", spent: 20000, remaining: 0, budget: 20000 },
          ],
        },
        {
          kind: "fixed",
          total: { spent: 90000, remaining: 51000, budget: 141000 },
          categories: [{ largeName: "住宅", spent: 90000, remaining: 51000, budget: 141000 }],
        },
      ],
    });
  });

  test("支出全体の行が無ければ ELEMENT_NOT_FOUND(2)", () => {
    const e = caught(() =>
      parseBudget(
        rows.filter((x) => !x.classes.includes("total_expense")),
        "2026/09",
      ),
    );
    expect(e.exitCode).toBe(2);
    expect(e.message).toBe("budget total row not found");
  });

  test("区分の小計より前に大項目が来たら ELEMENT_NOT_FOUND(2)", () => {
    const e = caught(() => parseBudget([rows[2]!, rows[4]!], "2026/09"));
    expect(e.exitCode).toBe(2);
    expect(e.message).toBe("budget category row before any group");
  });

  test("金額の td が無い行は ELEMENT_NOT_FOUND(2)", () => {
    const e = caught(() => parseBudget([r(["total_expense"], th("支出全体"))], "2026/09"));
    expect(e.exitCode).toBe(2);
    expect(e.message).toBe('budget row "支出全体": td.amount not found');
  });

  for (const bad of ["2026-09", "26/09", "", "2026/9", "2026/09/01"]) {
    test(`月の表記 ${JSON.stringify(bad)} は ELEMENT_NOT_FOUND(2)`, () => {
      const e = caught(() => parseBudget(rows, bad));
      expect(e.exitCode).toBe(2);
      expect(e.message).toBe(`unexpected month label: ${JSON.stringify(bad)}`);
    });
  }
});

describe("monthOffset", () => {
  const today = new Date(2026, 9, 12);

  test("当月は 0、前月は 1、年をまたいでも月数で数える", () => {
    expect(monthOffset("2026-10", today)).toBe(0);
    expect(monthOffset("2026-09", today)).toBe(1);
    expect(monthOffset("2025-12", today)).toBe(10);
  });

  test("未来の月は INVALID_INPUT(3)", () => {
    const e = caught(() => monthOffset("2026-11", today));
    expect(e).toBeInstanceOf(AppError);
    expect(e.exitCode).toBe(3);
    expect(e.message).toBe("--month is in the future: 2026-11");
  });

  for (const bad of ["2026-13", "2026-00", "2026-1", "202610", "", "2026/10"]) {
    test(`形の違う ${JSON.stringify(bad)} は INVALID_INPUT(3)`, () => {
      const e = caught(() => monthOffset(bad, today));
      expect(e.exitCode).toBe(3);
      expect(e.message).toBe(`invalid --month: ${bad}`);
    });
  }
});

describe("toBudgetLines", () => {
  test("支出全体 → 区分の小計 → その大項目 の順に平らにする", () => {
    const lines = toBudgetLines(parseBudget(rows, "2026/09"));
    expect(lines.map((l) => [l.kind, l.largeName, l.budget])).toEqual([
      ["total", null, 200000],
      ["variable", null, 59000],
      ["variable", "食費", 39000],
      ["variable", "日用品", 20000],
      ["fixed", null, 141000],
      ["fixed", "住宅", 141000],
    ]);
    expect(lines[2]).toEqual({
      month: "2026-09",
      kind: "variable",
      largeName: "食費",
      spent: 40000,
      remaining: -1000,
      budget: 39000,
    });
  });
});

describe("parseBudget の区分", () => {
  test("変動費 / 固定費のどちらでもない小計の行は ELEMENT_NOT_FOUND(2)", () => {
    const e = caught(() =>
      parseBudget(
        [rows[2]!, line(["budget_type_total_expense"], "謎の区分", "1円", "1円")],
        "2026/09",
      ),
    );
    expect(e.exitCode).toBe(2);
    expect(e.message).toBe('budget group row "謎の区分": kind not found');
  });
});

describe("fetchBudget", () => {
  function fakePage(opts: { url?: string; root: boolean; label: string; rows: RawRow[] }) {
    const calls: string[] = [];
    const page = {
      goto: async (u: string) => {
        calls.push(`goto ${u}`);
      },
      url: () => opts.url ?? "https://moneyforward.com/spending_summaries",
      $: async (sel: string) => {
        calls.push(`$ ${sel}`);
        if (sel === "#main-container")
          return { textContent: async () => `前月 ${opts.label} 予算` };
        return opts.root ? {} : null;
      },
      $$eval: async (sel: string) => {
        calls.push(`$$eval ${sel}`);
        return opts.rows;
      },
    };
    return { page: page as unknown as Parameters<typeof fetchBudget>[0], calls };
  }

  test("offset_month を付けて開き、表示中の月が合えば返す", async () => {
    const { page, calls } = fakePage({ root: true, label: "2026/09", rows });
    expect((await fetchBudget(page, 1, "2026-09")).month).toBe("2026-09");
    expect(calls).toEqual([
      "goto https://moneyforward.com/spending_summaries?offset_month=1",
      "$ #budgets-progress",
      "$ #main-container",
      "$$eval #budgets-progress table tr",
    ]);
  });

  test("表示中の月が求めた月と違えば ELEMENT_NOT_FOUND(2)", async () => {
    const { page } = fakePage({ root: true, label: "2026/08", rows });
    await expect(fetchBudget(page, 1, "2026-09")).rejects.toThrow(
      "budget page shows 2026-08, expected 2026-09",
    );
  });

  test("ログイン画面に飛ばされたら、表が無くても AUTH_FAILED(1)", async () => {
    const { page } = fakePage({
      root: false,
      label: "",
      rows: [],
      url: "https://moneyforward.com/sign_in",
    });
    let got: unknown;
    try {
      await fetchBudget(page, 0, "2026-10");
    } catch (e) {
      got = e;
    }
    expect((got as AppError).exitCode).toBe(1);
  });

  test("#budgets-progress が無ければ ELEMENT_NOT_FOUND(2)", async () => {
    const { page } = fakePage({ root: false, label: "2026/10", rows });
    await expect(fetchBudget(page, 0, "2026-10")).rejects.toThrow(
      "budget page layout changed: #budgets-progress not found",
    );
  });
});
