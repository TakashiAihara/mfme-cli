import type { Page } from "playwright";
import type { CategoryMeta } from "../types.ts";

export async function fetchCategoryMeta(page: Page): Promise<CategoryMeta> {
  await page.goto("https://moneyforward.com/cf", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("tr.transaction_list .v_l_ctg", { timeout: 20_000 });

  // 既存の取引行の大項目ドロップダウンをクリックすると
  // 全大項目 (l_c_name) と各配下の中項目 (sub_menu > m_c_name) が一括描画される
  await page.click("tr.transaction_list .v_l_ctg");
  // サーバーからの async 描画待ち
  await page.waitForFunction(
    () => document.querySelectorAll("a.l_c_name").length > 0,
    undefined,
    { timeout: 10_000 },
  );

  const data = await page.evaluate(() => {
    const large = Array.from(document.querySelectorAll<HTMLAnchorElement>("a.l_c_name")).map((a) => ({
      id: a.getAttribute("id") ?? "",
      name: (a.textContent ?? "").trim(),
    }));

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
