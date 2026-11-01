import { describe, expect, test } from "bun:test";
import type { Page } from "playwright";
import { AppError } from "../errors.ts";
import { monthCursor, filterByDate, fetchTransactions } from "./transactions.ts";
import { EXIT, type Transaction } from "../types.ts";

const baseTx: Omit<Transaction, "date"> = {
  id: "1",
  amount: 100,
  account: "bank",
  category: null,
  memo: null,
  title: "test",
  isTransfer: false,
  isManualEntry: false,
};

function tx(date: string): Transaction {
  return { ...baseTx, date };
}

describe("monthCursor", () => {
  test("同月", () => {
    expect(monthCursor("2026-01-01", "2026-01-31")).toEqual([{ from: "2026/1/1" }]);
  });

  test("複数月", () => {
    expect(monthCursor("2026-01-01", "2026-03-31")).toEqual([
      { from: "2026/1/1" },
      { from: "2026/2/1" },
      { from: "2026/3/1" },
    ]);
  });

  test("年跨ぎ", () => {
    expect(monthCursor("2025-11-01", "2026-02-01")).toEqual([
      { from: "2025/11/1" },
      { from: "2025/12/1" },
      { from: "2026/1/1" },
      { from: "2026/2/1" },
    ]);
  });
});

describe("filterByDate", () => {
  const txs = [tx("2026-01-01"), tx("2026-01-15"), tx("2026-01-31"), tx("2026-02-01")];

  test("境界日を含む (inclusive)", () => {
    const result = filterByDate(txs, "2026-01-01", "2026-01-31");
    expect(result.map((t) => t.date)).toEqual(["2026-01-01", "2026-01-15", "2026-01-31"]);
  });

  test("since より前を除外", () => {
    const result = filterByDate(txs, "2026-01-15", "2026-02-01");
    expect(result.map((t) => t.date)).toEqual(["2026-01-15", "2026-01-31", "2026-02-01"]);
  });

  test("空リスト", () => {
    expect(filterByDate([], "2026-01-01", "2026-01-31")).toEqual([]);
  });
});

// /cf の DOM を月単位で持つだけの fake。/cf を開いた直後は current の月が載っている
function fakeCf(o: { current: string; rows: Record<string, number>; listBody?: boolean }): Page {
  let month = o.current;
  const page = {
    goto: async () => null,
    url: () => "https://moneyforward.com/cf",
    $: async (sel: string) => (sel === ".list_body" && o.listBody !== false ? {} : null),
    // 行を待つ実装に戻すと、行の無い月ではここで実物と同じく timeout する
    waitForSelector: async (sel: string) => {
      throw new Error(`waitForSelector: Timeout exceeded (${sel})`);
    },
    evaluate: async (_fn: unknown, from: string) => {
      month = from;
      return { ok: true, error: null };
    },
    $$eval: async () =>
      Array.from({ length: o.rows[month] ?? 0 }, (_, i) => ({
        ...baseTx,
        id: `${month}-${i}`,
        date: month.replace(
          /^(\d+)\/(\d+)\/1$/,
          (_m, y, m) => `${y}-${String(m).padStart(2, "0")}-15`,
        ),
      })),
  };
  return page as unknown as Page;
}

async function rejection(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error("did not throw");
}

describe("fetchTransactions", () => {
  test("当月が 0 件でも過去月の行を返す", async () => {
    const page = fakeCf({ current: "2026/11/1", rows: { "2026/10/1": 3 } });
    const txs = await fetchTransactions(page, { since: "2026-10-01", until: "2026-10-31" });
    expect(txs.map((t) => t.id)).toEqual(["2026/10/1-0", "2026/10/1-1", "2026/10/1-2"]);
  });

  test("期間の全月が 0 件なら空配列で成功する", async () => {
    const page = fakeCf({ current: "2026/11/1", rows: {} });
    expect(await fetchTransactions(page, { since: "2026-11-01", until: "2026-11-30" })).toEqual([]);
  });

  test(".list_body が無ければ 0 件ではなく ELEMENT_NOT_FOUND で止まる", async () => {
    const page = fakeCf({ current: "2026/11/1", rows: { "2026/10/1": 3 }, listBody: false });
    const e = await rejection(
      fetchTransactions(page, { since: "2026-10-01", until: "2026-10-31" }),
    );
    expect(e).toBeInstanceOf(AppError);
    expect(e.exitCode).toBe(EXIT.ELEMENT_NOT_FOUND);
    expect(e.message).toContain("(.list_body) not found on /cf");
  });
});
