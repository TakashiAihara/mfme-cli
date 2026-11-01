import { describe, expect, test } from "bun:test";
import type { Page } from "playwright";
import { fetchCategoryMeta } from "./categories.ts";

// 当月 0 件の /cf。取引行は無く、手入力モーダルのボタンだけがある
function fakeEmptyCf() {
  const clicked: string[] = [];
  let rendered = false;
  const page = {
    goto: async () => null,
    url: () => "https://moneyforward.com/cf",
    // 行を待つ実装に戻すと、実物と同じくここで timeout する
    waitForSelector: async (sel: string) => {
      throw new Error(`waitForSelector: Timeout exceeded (${sel})`);
    },
    click: async (sel: string) => {
      if (sel.startsWith("tr.transaction_list")) throw new Error(`click: no element ${sel}`);
      clicked.push(sel);
      if (sel === "#user_asset_act_new .v_l_ctg") rendered = true;
    },
    waitForFunction: async () => {
      if (!rendered) throw new Error("waitForFunction: Timeout exceeded");
    },
    evaluate: async () => ({
      large: [
        { id: "11", name: "食費" },
        { id: "", name: "" },
      ],
      middle: [{ id: "41", name: "食料品", largeId: "11" }],
    }),
  };
  return { page: page as unknown as Page, clicked };
}

describe("fetchCategoryMeta", () => {
  test("取引行が無い月でも手入力モーダルからカテゴリを読む", async () => {
    const { page, clicked } = fakeEmptyCf();
    const meta = await fetchCategoryMeta(page);
    expect(clicked).toEqual(["button.cf-new-btn >> visible=true", "#user_asset_act_new .v_l_ctg"]);
    expect(meta.large).toEqual([{ id: "11", name: "食費" }]);
    expect(meta.middle).toEqual([{ id: "41", name: "食料品", largeId: "11" }]);
  });
});
