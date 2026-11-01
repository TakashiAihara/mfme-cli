import { describe, expect, test } from "bun:test";
import type { Page } from "playwright";
import { AppError } from "../errors.ts";
import { EXIT } from "../types.ts";
import { fetchCategoryMeta } from "./categories.ts";

// 当月 0 件の /cf。取引行は無く、手入力モーダルのボタンだけがある。
// 大項目の一覧はドロップダウンを開き、描画を待ってからでないと読めない
function fakeEmptyCf(o: { url?: string; button?: boolean } = {}) {
  const clicked: string[] = [];
  let loaded = false;
  let opened = false;
  let rendered = false;
  const page = {
    goto: async (url: string) => {
      loaded = url === "https://moneyforward.com/cf";
      return null;
    },
    url: () => o.url ?? "https://moneyforward.com/cf",
    $: async (sel: string) =>
      loaded && sel === "button.cf-new-btn" && o.button !== false ? {} : null,
    click: async (sel: string) => {
      if (sel.startsWith("tr.transaction_list")) throw new Error(`click: no element ${sel}`);
      clicked.push(sel);
      if (sel === "#user_asset_act_new .v_l_ctg") opened = true;
    },
    waitForFunction: async () => {
      if (!opened) throw new Error("waitForFunction: Timeout exceeded");
      rendered = true;
    },
    evaluate: async () => {
      if (!rendered) return { large: [], middle: [] };
      return {
        large: [
          { id: "11", name: "食費" },
          { id: "", name: "" },
        ],
        middle: [{ id: "41", name: "食料品", largeId: "11" }],
      };
    },
  };
  return { page: page as unknown as Page, clicked };
}

async function rejection(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error("did not throw");
}

describe("fetchCategoryMeta", () => {
  test("取引行が無い月でも手入力モーダルからカテゴリを読む", async () => {
    const { page, clicked } = fakeEmptyCf();
    const meta = await fetchCategoryMeta(page);
    expect(clicked).toEqual(["button.cf-new-btn >> visible=true", "#user_asset_act_new .v_l_ctg"]);
    expect(meta.large).toEqual([{ id: "11", name: "食費" }]);
    expect(meta.middle).toEqual([{ id: "41", name: "食料品", largeId: "11" }]);
  });

  test("手入力ボタンが無ければ click の timeout を待たずに ELEMENT_NOT_FOUND で止まる", async () => {
    const { page, clicked } = fakeEmptyCf({ button: false });
    const e = await rejection(fetchCategoryMeta(page));
    expect(e).toBeInstanceOf(AppError);
    expect(e.exitCode).toBe(EXIT.ELEMENT_NOT_FOUND);
    expect(e.message).toContain("(button.cf-new-btn) not found on /cf");
    expect(clicked).toEqual([]);
  });

  test("ログイン画面に飛ばされたら AUTH_FAILED で止まる", async () => {
    const { page } = fakeEmptyCf({ url: "https://moneyforward.com/sign_in" });
    expect((await rejection(fetchCategoryMeta(page))).exitCode).toBe(EXIT.AUTH_FAILED);
  });
});
