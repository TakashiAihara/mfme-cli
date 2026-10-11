import { describe, expect, test } from "bun:test";
import { AppError } from "../errors.ts";
import { filterTransactions, toCsvRow, toListFilter } from "./list.ts";
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

  // a0 だけが全条件を満たし、a1〜a5 はそれぞれ 1 条件だけ外す。どの条件を外しても結果が変わる
  test("複合フィルタは AND で効く", () => {
    const a0: Transaction = {
      ...fixtures[0]!,
      id: "a0",
      account: "三井住友銀行",
      category: null,
      amount: -1000,
      isTransfer: false,
    };
    const all = [
      a0,
      { ...a0, id: "a1", account: "楽天カード" },
      { ...a0, id: "a2", isTransfer: true },
      { ...a0, id: "a3", category: cat("食費", "外食") },
      { ...a0, id: "a4", amount: -6000 },
      { ...a0, id: "a5", amount: 500 },
    ];
    const got = filterTransactions(all, {
      account: "三井",
      transfer: false,
      uncategorized: true,
      minAmount: -5000,
      maxAmount: -100,
    });
    expect(ids(got)).toEqual(["a0"]);
  });
});

describe("filterTransactions の未分類", () => {
  const uncategorizedFixtures: Transaction[] = [
    { ...fixtures[0]!, id: "u1", category: null },
    {
      ...fixtures[0]!,
      id: "u2",
      category: { largeId: "0", largeName: "表示名", middleId: "5", middleName: "表示名" },
    },
    { ...fixtures[0]!, id: "u3", category: cat("食費", "外食") },
    {
      ...fixtures[0]!,
      id: "u4",
      category: { largeId: "9", largeName: "未分類", middleId: "0", middleName: "未分類" },
    },
  ];

  test("--uncategorized は null と大項目 id 0 の両方を拾う", () => {
    const got = filterTransactions(uncategorizedFixtures, { transfer: true, uncategorized: true });
    expect(ids(got)).toEqual(["u1", "u2"]);
  });
});

describe("toListFilter", () => {
  test("何も指定しなければ振替を含み、他は絞らない", () => {
    expect(toListFilter({})).toEqual({
      account: undefined,
      transfer: true,
      uncategorized: false,
      minAmount: undefined,
      maxAmount: undefined,
    });
  });

  test("--no-transfer と金額 (負数を含む) をそのまま渡す", () => {
    expect(
      toListFilter({ transfer: false, uncategorized: true, minAmount: "-5000", maxAmount: "-800" }),
    ).toEqual({
      account: undefined,
      transfer: false,
      uncategorized: true,
      minAmount: -5000,
      maxAmount: -800,
    });
  });

  for (const bad of [
    "",
    " ",
    "abc",
    "1e3",
    "0x10",
    "12.5",
    " 12 ",
    "9007199254740993",
    "9".repeat(400),
  ]) {
    test(`金額 ${JSON.stringify(bad)} は INVALID_INPUT(3)`, () => {
      let caught: unknown;
      try {
        toListFilter({ minAmount: bad });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AppError);
      expect((caught as AppError).exitCode).toBe(3);
      expect((caught as AppError).message).toBe(`invalid --min-amount: ${bad}`);
    });
  }

  test("--max-amount の不正値はフラグ名をそのまま出す", () => {
    let caught: unknown;
    try {
      toListFilter({ maxAmount: "x" });
    } catch (e) {
      caught = e;
    }
    expect((caught as AppError).exitCode).toBe(3);
    expect((caught as AppError).message).toBe("invalid --max-amount: x");
  });

  test("min > max は INVALID_INPUT(3)、min = max は通る", () => {
    let caught: unknown;
    try {
      toListFilter({ minAmount: "10", maxAmount: "5" });
    } catch (e) {
      caught = e;
    }
    expect((caught as AppError).exitCode).toBe(3);
    expect((caught as AppError).message).toBe("--min-amount が --max-amount より大きい");
    expect(toListFilter({ minAmount: "5", maxAmount: "5" }).minAmount).toBe(5);
  });
});

describe("toListFilter の --account", () => {
  test("空文字は INVALID_INPUT(3)", () => {
    expect(() => toListFilter({ account: "" })).toThrow("invalid --account: empty");
  });
});
