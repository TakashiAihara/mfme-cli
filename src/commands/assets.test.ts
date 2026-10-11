import { describe, expect, test } from "bun:test";
import { reportAssetFailures, toAssetCsvRow } from "./assets.ts";

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

describe("reportAssetFailures", () => {
  test("失敗が無ければ 0 で、何も出さない", () => {
    const writes: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((s: string) => (writes.push(s), true)) as typeof process.stderr.write;
    try {
      expect(reportAssetFailures([])).toBe(0);
    } finally {
      process.stderr.write = orig;
    }
    expect(writes).toEqual([]);
  });

  test("失敗が 1 つでもあれば 4 で、節ごとに理由を 1 行出す", () => {
    const writes: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((s: string) => (writes.push(s), true)) as typeof process.stderr.write;
    try {
      expect(
        reportAssetFailures([
          { section: "未知の節", reason: "table not found" },
          { section: "", reason: "section title not found" },
        ]),
      ).toBe(4);
    } finally {
      process.stderr.write = orig;
    }
    expect(writes).toEqual([
      '[warn] asset section "未知の節" skipped: table not found\n',
      '[warn] asset section "" skipped: section title not found\n',
    ]);
  });
});
