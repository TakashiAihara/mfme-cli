import { describe, expect, test } from "bun:test";
import { toCsvRow } from "./list.ts";
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
