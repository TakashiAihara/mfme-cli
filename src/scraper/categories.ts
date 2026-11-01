import type { Page } from "playwright";
import { AppError } from "../errors.ts";
import { EXIT, type CategoryMeta } from "../types.ts";
import { assertAuthenticated } from "./auth.ts";
import { URL_CF } from "./urls.ts";

export async function fetchCategoryMeta(page: Page): Promise<CategoryMeta> {
  await page.goto(URL_CF, { waitUntil: "domcontentloaded" });
  await assertAuthenticated(page);

  // 手入力モーダルの大項目ドロップダウンをクリックすると
  // 全大項目 (l_c_name) と各配下の中項目 (sub_menu > m_c_name) が一括描画される。
  // 取引行のドロップダウンでも同じものが出るが、当月 0 件の月初は行が無い (#67)。
  // 2026-11-01 に両者の id / 名前が全件一致することを確かめた
  // ボタンはサーバの HTML に入っている (2026-11-01 確認)。無ければ画面の作りが変わったか保守画面なので、click の timeout を待たずに止める
  if ((await page.$("button.cf-new-btn")) === null) {
    throw new AppError(
      "manual entry button (button.cf-new-btn) not found on /cf",
      EXIT.ELEMENT_NOT_FOUND,
    );
  }
  await page.click("button.cf-new-btn >> visible=true", { timeout: 10_000 });
  await page.click("#user_asset_act_new .v_l_ctg", { timeout: 10_000 });
  // サーバーからの async 描画待ち
  await page.waitForFunction(() => document.querySelectorAll("a.l_c_name").length > 0, undefined, {
    timeout: 10_000,
  });

  const data = await page.evaluate(() => {
    const large = Array.from(document.querySelectorAll<HTMLAnchorElement>("a.l_c_name")).map(
      (a) => ({
        id: a.getAttribute("id") ?? "",
        name: (a.textContent ?? "").trim(),
      }),
    );

    const middle: Array<{ id: string; name: string; largeId: string }> = [];
    document.querySelectorAll<HTMLUListElement>("ul.sub_menu").forEach((ul) => {
      const largeId = ul.getAttribute("id") ?? "";
      ul.querySelectorAll<HTMLAnchorElement>("a.m_c_name").forEach((a) => {
        const id = a.getAttribute("id") ?? "";
        const name = (a.textContent ?? "").trim();
        if (id && name) middle.push({ id, name, largeId });
      });
    });

    return { large, middle };
  });

  return {
    large: data.large.filter((l) => l.id && l.name),
    middle: data.middle,
    updatedAt: new Date().toISOString(),
  };
}
