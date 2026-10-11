import { describe, expect, test } from "bun:test";
import { toAssetCsvRow } from "./assets.ts";

describe("toAssetCsvRow", () => {
  test("type,name,balance,institution の順で、details は CSV に出さない", () => {
    expect(
      toAssetCsvRow({
        type: "ポイント",
        name: 'P "1"',
        balance: 1500,
        institution: "C カード",
        details: { 換算レート: "1" },
      }),
    ).toBe(`"ポイント","P ""1""","1500","C カード"`);
  });
});
