import { describe, expect, test } from "bun:test";
import { monthCursor, filterByDate } from "./transactions.ts";
import type { Transaction } from "../types.ts";

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
