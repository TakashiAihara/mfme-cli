import { describe, expect, test } from "bun:test";
import { toLiabilityCsvRow } from "./liabilities.ts";

describe("toLiabilityCsvRow", () => {
  test("type,name,balance,institution の順で全セルを引用符で囲む", () => {
    expect(
      toLiabilityCsvRow({
        type: "奨学金",
        name: "第一種",
        balance: 1234000,
        institution: "B 機構",
      }),
    ).toBe(`"奨学金","第一種","1234000","B 機構"`);
  });

  test('" は "" にする', () => {
    expect(
      toLiabilityCsvRow({ type: "ローン", name: 'say "hi"', balance: -5, institution: "" }),
    ).toBe(`"ローン","say ""hi""","-5",""`);
  });
});
