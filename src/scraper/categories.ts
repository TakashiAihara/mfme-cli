import type { Page } from "playwright";
import type { CategoryMeta } from "../types.ts";
import { URL_CF } from "./urls.ts";

export async function fetchCategoryMeta(page: Page): Promise<CategoryMeta> {
  await page.goto(URL_CF, { waitUntil: "domcontentloaded" });

  const data = await page.evaluate(() => {
    const large: Array<{ id: string; name: string }> = [];
    const middle: Array<{ id: string; name: string; largeId: string }> = [];

    document
      .querySelectorAll<HTMLElement>("ul.dropdown-menu.l_c_name li a, .large-category-list a")
      .forEach((a) => {
        const id = a.getAttribute("data-id") ?? a.getAttribute("data-value") ?? "";
        const name = (a.textContent ?? "").trim();
        if (id && name) large.push({ id, name });
      });

    document
      .querySelectorAll<HTMLElement>("ul.dropdown-menu.m_c_name li a, .middle-category-list a")
      .forEach((a) => {
        const id = a.getAttribute("data-id") ?? a.getAttribute("data-value") ?? "";
        const name = (a.textContent ?? "").trim();
        const largeId = a.getAttribute("data-l-id") ?? a.getAttribute("data-large-category-id") ?? "";
        if (id && name) middle.push({ id, name, largeId });
      });

    return { large, middle };
  });

  return {
    large: data.large,
    middle: data.middle,
    updatedAt: new Date().toISOString(),
  };
}
