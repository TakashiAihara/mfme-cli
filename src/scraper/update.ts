import type { Page } from "playwright";
import type { CategoryMeta } from "../types.ts";

export interface UpdatePayload {
  memo?: string;
  largeCategoryId?: string;
  middleCategoryId?: string;
}

export function resolveCategoryIds(
  meta: CategoryMeta,
  spec: string,
): { largeCategoryId: string; middleCategoryId: string } {
  const [largeName, middleName] = spec.split("/").map((s) => s.trim());
  if (!largeName || !middleName) {
    throw new Error(`category must be "大項目/中項目" (got: ${spec})`);
  }
  const large = meta.large.find((l) => l.name === largeName);
  if (!large) throw new Error(`unknown large category: ${largeName}`);
  const middle = meta.middle.find(
    (m) => m.name === middleName && m.largeId === large.id,
  );
  if (!middle) throw new Error(`unknown middle category: ${middleName} under ${largeName}`);
  return { largeCategoryId: large.id, middleCategoryId: middle.id };
}

export async function updateTransaction(
  page: Page,
  txId: string,
  payload: UpdatePayload,
): Promise<void> {
  const result = await page.evaluate(
    async ({ txId, payload }) => {
      const token = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content;
      if (!token) throw new Error("csrf-token not found");

      const form = new URLSearchParams();
      if (payload.memo !== undefined) form.set("user_asset_act[memo]", payload.memo);
      if (payload.largeCategoryId) form.set("user_asset_act[large_category_id]", payload.largeCategoryId);
      if (payload.middleCategoryId) form.set("user_asset_act[middle_category_id]", payload.middleCategoryId);

      const res = await fetch(`/user_asset_acts/${txId}`, {
        method: "PUT",
        headers: {
          "X-CSRF-Token": token,
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json, text/javascript, */*; q=0.01",
        },
        body: form.toString(),
        credentials: "same-origin",
      });
      return { ok: res.ok, status: res.status };
    },
    { txId, payload },
  );
  if (!result.ok) {
    throw new Error(`update failed: HTTP ${result.status}`);
  }
}
