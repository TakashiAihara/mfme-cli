import { describe, expect, test } from "bun:test";
import { filterTransactions, toCsvRow } from "./list.ts";
import type { Transaction } from "../types.ts";

const baseTx: Transaction = {
  id: "123",
  date: "2026-01-15",
  amount: 1000,
  account: "三井住友銀行",
  category: { largeId: "L1", largeName: "食費", middleId: "M1", middleName: "外食" },
  memo: null,
  title: "スターバックス",
  isTransfer: false,
  isManualEntry: false,
};

describe("toCsvRow", () => {
  test("通常行", () => {
    expect(toCsvRow(baseTx)).toBe(
      `"123","2026-01-15","1000","三井住友銀行","食費/外食","","スターバックス"`,
    );
  });

  test('memo に " が含まれる場合はエスケープ', () => {
    const tx = { ...baseTx, memo: 'メモ"テスト"' };
    expect(toCsvRow(tx)).toContain('"メモ""テスト"""');
  });

  test("カテゴリなし", () => {
    const tx = { ...baseTx, category: null };
    expect(toCsvRow(tx)).toContain('""');
  });

  test("memo なし → 空文字", () => {
    const tx = { ...baseTx, memo: null };
    const row = toCsvRow(tx);
    const cols = row.split(",");
    expect(cols[5]).toBe('""');
  });
});

const cat = (largeName: string, middleName: string) => ({
  largeId: `L-${largeName}`,
  largeName,
  middleId: `M-${middleName}`,
  middleName,
});

const fixtures: Transaction[] = [
  {
    id: "t1",
    date: "2026-01-05",
    amount: -5000,
    account: "三井住友銀行",
    category: cat("食費", "外食"),
    memo: null,
    title: "定食",
    isTransfer: false,
    isManualEntry: false,
  },
  {
    id: "t2",
    date: "2026-01-06",
    amount: -800,
    account: "楽天カード",
    category: null,
    memo: null,
    title: "コンビニ",
    isTransfer: false,
    isManualEntry: false,
  },
  {
    id: "t3",
    date: "2026-01-07",
    amount: 1200,
    account: "三井住友銀行",
    category: cat("収入", "仕事"),
    memo: null,
    title: "業務委託費",
    isTransfer: false,
    isManualEntry: false,
  },
  {
    id: "t4",
    date: "2026-01-08",
    amount: 300000,
    account: "ゆうちょ銀行",
    category: cat("振替", "入金"),
    memo: null,
    title: "給与振込",
    isTransfer: true,
    isManualEntry: false,
  },
  {
    id: "t5",
    date: "2026-01-09",
    amount: -500,
    account: "楽天カード",
    category: cat("食費", "食料品"),
    memo: null,
    title: "スーパーで食材",
    isTransfer: false,
    isManualEntry: false,
  },
];

const ids = (txs: Transaction[]) => txs.map((tx) => tx.id);

describe("filterTransactions", () => {
  test("フィルタなし → 全件", () => {
    const got = filterTransactions(fixtures, { transfer: true, uncategorized: false });
    expect(ids(got)).toEqual(["t1", "t2", "t3", "t4", "t5"]);
  });

  test("--account は部分一致", () => {
    const f = { transfer: true, uncategorized: false };
    expect(ids(filterTransactions(fixtures, { ...f, account: "三井" }))).toEqual(["t1", "t3"]);
    expect(ids(filterTransactions(fixtures, { ...f, account: "カード" }))).toEqual(["t2", "t5"]);
    expect(ids(filterTransactions(fixtures, { ...f, account: "りそな" }))).toEqual([]);
  });

  test("--no-transfer → 振替のみ落とす", () => {
    const got = filterTransactions(fixtures, { transfer: false, uncategorized: false });
    expect(ids(got)).toEqual(["t1", "t2", "t3", "t5"]);
  });

  test("--uncategorized → カテゴリなしのみ", () => {
    const got = filterTransactions(fixtures, { transfer: true, uncategorized: true });
    expect(ids(got)).toEqual(["t2"]);
  });

  test("--min-amount は境界を含む", () => {
    const f = { transfer: true, uncategorized: false };
    expect(ids(filterTransactions(fixtures, { ...f, minAmount: -800 }))).toEqual([
      "t2",
      "t3",
      "t4",
      "t5",
    ]);
    expect(ids(filterTransactions(fixtures, { ...f, minAmount: -500 }))).toEqual([
      "t3",
      "t4",
      "t5",
    ]);
    expect(ids(filterTransactions(fixtures, { ...f, minAmount: 300000 }))).toEqual(["t4"]);
  });

  test("--max-amount は境界を含む (負の値)", () => {
    const f = { transfer: true, uncategorized: false };
    expect(ids(filterTransactions(fixtures, { ...f, maxAmount: -800 }))).toEqual(["t1", "t2"]);
    expect(ids(filterTransactions(fixtures, { ...f, maxAmount: 1200 }))).toEqual([
      "t1",
      "t2",
      "t3",
      "t5",
    ]);
  });

  test("複合フィルタは AND で効く", () => {
    const got = filterTransactions(fixtures, {
      account: "三井",
      transfer: true,
      uncategorized: false,
      minAmount: -6000,
      maxAmount: 2000,
    });
    expect(ids(got)).toEqual(["t1", "t3"]);
  });

  test("複合フィルタ (振替除外 + 未分類 + 金額範囲)", () => {
    const got = filterTransactions(fixtures, {
      account: "カード",
      transfer: false,
      uncategorized: true,
      minAmount: -1000,
      maxAmount: -100,
    });
    expect(ids(got)).toEqual(["t2"]);
  });
});
