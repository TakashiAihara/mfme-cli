import { describe, expect, test } from "bun:test";
import type { Page } from "playwright";
import { resolveCategoryIds, updateTransaction } from "./update.ts";
import type { CategoryMeta } from "../types.ts";

const meta: CategoryMeta = {
  large: [
    { id: "L1", name: "食費" },
    { id: "L2", name: "交通費" },
  ],
  middle: [
    { id: "M1", name: "外食", largeId: "L1" },
    { id: "M2", name: "コンビニ", largeId: "L1" },
    { id: "M3", name: "電車", largeId: "L2" },
    { id: "M4", name: "外食", largeId: "L2" },
  ],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("resolveCategoryIds", () => {
  test("正常: 大項目/中項目", () => {
    expect(resolveCategoryIds(meta, "食費/外食")).toEqual({
      largeCategoryId: "L1",
      middleCategoryId: "M1",
    });
  });

  test("正常: 同名中項目でも別大項目なら正しく解決", () => {
    expect(resolveCategoryIds(meta, "交通費/外食")).toEqual({
      largeCategoryId: "L2",
      middleCategoryId: "M4",
    });
  });

  test("エラー: スラッシュなし", () => {
    expect(() => resolveCategoryIds(meta, "食費")).toThrow();
  });

  test("エラー: スラッシュが2つ以上", () => {
    expect(() => resolveCategoryIds(meta, "食費/外食/ランチ")).toThrow();
  });

  test("エラー: 未知の大項目", () => {
    expect(() => resolveCategoryIds(meta, "娯楽費/映画")).toThrow();
  });

  test("エラー: 未知の中項目", () => {
    expect(() => resolveCategoryIds(meta, "食費/映画")).toThrow();
  });
});

// updateTransaction は page.evaluate に渡すコールバックの中で fetch する。
// テストでは evaluate をその場で実行する fake page を渡し、fetch / document を差し替えて
// 実際に飛ぶリクエスト (method / URL / body / headers) を検査する
type CapturedRequest = { url: string; init: RequestInit };

function fakePage(): { page: Page; requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  const page = {
    evaluate: async <A, R>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R> => fn(arg),
  } as unknown as Page;
  return { page, requests };
}

function stubBrowserGlobals(
  requests: CapturedRequest[],
  response: { ok: boolean; status: number; body: string },
  csrfToken: string | null = "csrf-token-value",
): () => void {
  const originalFetch = globalThis.fetch;
  const originalDocument = (globalThis as { document?: unknown }).document;

  (globalThis as { document?: unknown }).document = {
    querySelector: (selector: string) =>
      selector === 'meta[name="csrf-token"]' && csrfToken !== null ? { content: csrfToken } : null,
  };

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return {
      ok: response.ok,
      status: response.status,
      text: async () => response.body,
    };
  }) as unknown as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
    (globalThis as { document?: unknown }).document = originalDocument;
  };
}

describe("updateTransaction", () => {
  // ME の /cf/update は PUT のみ受け付ける。POST だと routing に無く 404 になる (#43)
  test("PUT で /cf/update に送る", async () => {
    const { page, requests } = fakePage();
    const restore = stubBrowserGlobals(requests, { ok: true, status: 200, body: "// js response" });

    try {
      await updateTransaction(page, "tx_1", { largeCategoryId: "11", middleCategoryId: "41" });
    } finally {
      restore();
    }

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("/cf/update");
    expect(requests[0]?.init.method).toBe("PUT");
  });

  test("body に txId / table_name / カテゴリ ID を載せる", async () => {
    const { page, requests } = fakePage();
    const restore = stubBrowserGlobals(requests, { ok: true, status: 200, body: "// js response" });

    try {
      await updateTransaction(page, "tx_1", {
        memo: "メモ",
        largeCategoryId: "11",
        middleCategoryId: "41",
      });
    } finally {
      restore();
    }

    const body = new URLSearchParams(String(requests[0]?.init.body));
    expect(body.get("user_asset_act[id]")).toBe("tx_1");
    expect(body.get("user_asset_act[table_name]")).toBe("user_asset_act");
    expect(body.get("user_asset_act[memo]")).toBe("メモ");
    expect(body.get("user_asset_act[large_category_id]")).toBe("11");
    expect(body.get("user_asset_act[middle_category_id]")).toBe("41");
  });

  test("指定していないフィールドは body に載せない", async () => {
    const { page, requests } = fakePage();
    const restore = stubBrowserGlobals(requests, { ok: true, status: 200, body: "// js response" });

    try {
      await updateTransaction(page, "tx_1", { memo: "メモだけ" });
    } finally {
      restore();
    }

    const body = new URLSearchParams(String(requests[0]?.init.body));
    expect(body.has("user_asset_act[large_category_id]")).toBe(false);
    expect(body.has("user_asset_act[middle_category_id]")).toBe(false);
  });

  test("CSRF token をヘッダに載せる", async () => {
    const { page, requests } = fakePage();
    const restore = stubBrowserGlobals(requests, { ok: true, status: 200, body: "// js response" });

    try {
      await updateTransaction(page, "tx_1", { memo: "m" });
    } finally {
      restore();
    }

    const headers = requests[0]?.init.headers as Record<string, string>;
    expect(headers["X-CSRF-Token"]).toBe("csrf-token-value");
  });

  // 成功応答は text/javascript なので JSON にならない。これをエラー扱いしない
  test("text/javascript の正常応答は成功として扱う", async () => {
    const { page, requests } = fakePage();
    const restore = stubBrowserGlobals(requests, {
      ok: true,
      status: 200,
      body: "  // /cf用\n var prevLargeCategorySelectedVal = (function() {",
    });

    try {
      await expect(updateTransaction(page, "tx_1", { memo: "m" })).resolves.toBeUndefined();
    } finally {
      restore();
    }
  });

  test("HTTP エラーは throw する", async () => {
    const { page, requests } = fakePage();
    const restore = stubBrowserGlobals(requests, { ok: false, status: 500, body: "oops" });

    try {
      await expect(updateTransaction(page, "tx_1", { memo: "m" })).rejects.toThrow(/HTTP 500/);
    } finally {
      restore();
    }
  });

  // 404 は JSON で返るので、そのメッセージを拾って報告する
  test("JSON で返るエラーはメッセージを拾う", async () => {
    const { page, requests } = fakePage();
    const restore = stubBrowserGlobals(requests, {
      ok: false,
      status: 404,
      body: '{"status":404,"error":"Not Found"}',
    });

    try {
      await expect(updateTransaction(page, "tx_1", { memo: "m" })).rejects.toThrow(
        /update rejected: Not Found/,
      );
    } finally {
      restore();
    }
  });

  test("csrf-token が無ければ throw する", async () => {
    const { page, requests } = fakePage();
    const restore = stubBrowserGlobals(requests, { ok: true, status: 200, body: "" }, null);

    try {
      await expect(updateTransaction(page, "tx_1", { memo: "m" })).rejects.toThrow(/csrf-token/);
    } finally {
      restore();
    }
  });
});
