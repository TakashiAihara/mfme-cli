import { describe, expect, test } from "bun:test";
import type { Page } from "playwright";
import { AppError } from "../errors.ts";
import { EXIT } from "../types.ts";
import { fetchCategoryMeta, pastMonths } from "./categories.ts";
import { fetchTransactions } from "./transactions.ts";

class TimeoutError extends Error {
  override name = "TimeoutError";
}

type FakeOptions = {
  // 月 ("2026/10/1") ごとの行。/cf を開いた直後は current の行が載っている
  rows: Record<string, number>;
  current: string;
  listBody?: boolean;
  // 待ちが timeout 以外で落ちる (ページが閉じた等)
  waitError?: Error;
};

// /cf の DOM を月単位で持つだけの fake。行を待つ waitForSelector は行が無ければ実物と同じく timeout する
function fakeCf(o: FakeOptions) {
  let month = o.current;
  const waited: string[] = [];
  const fetched: string[] = [];
  const count = (sel: string) => {
    if (sel === ".list_body") return o.listBody === false ? 0 : 1;
    if (sel.startsWith("tr.transaction_list")) return o.rows[month] ?? 0;
    return 0;
  };
  const page = {
    goto: async () => null,
    url: () => "https://moneyforward.com/cf",
    waitForSelector: async (sel: string) => {
      waited.push(sel);
      if (o.waitError) throw o.waitError;
      if (count(sel) === 0) throw new TimeoutError(`waitForSelector: Timeout exceeded (${sel})`);
      return {};
    },
    evaluate: async (_fn: unknown, from?: string) => {
      // 引数の無い evaluate はカテゴリ一覧の読み取り
      if (from === undefined) return { large: [{ id: "1", name: "食費" }], middle: [] };
      fetched.push(from);
      month = from;
      return { ok: true, error: null };
    },
    $$: async (sel: string) => Array.from({ length: count(sel) }, () => ({})),
    $$eval: async (sel: string) =>
      Array.from({ length: count(sel) }, (_, i) => ({
        id: `${month}-${i}`,
        date: month.replace(
          /^(\d+)\/(\d+)\/1$/,
          (_m, y, m) => `${y}-${String(m).padStart(2, "0")}-15`,
        ),
        amount: -100,
        account: "bank",
        category: null,
        memo: null,
        title: sel,
        isTransfer: false,
        isManualEntry: false,
      })),
    click: async (sel: string) => {
      if (count(sel) === 0) throw new Error(`click: no element ${sel}`);
    },
    waitForFunction: async () => null,
  };
  return { page: page as unknown as Page, waited, fetched };
}

async function rejection(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error("did not throw");
}

describe("fetchTransactions", () => {
  test("当月が 0 件でも過去月の行を返す", async () => {
    const { page } = fakeCf({ current: "2026/11/1", rows: { "2026/10/1": 3 } });
    const txs = await fetchTransactions(page, { since: "2026-10-01", until: "2026-10-31" });
    expect(txs.map((t) => t.id)).toEqual(["2026/10/1-0", "2026/10/1-1", "2026/10/1-2"]);
  });

  test("期間の全月が 0 件なら空配列で成功する", async () => {
    const { page } = fakeCf({ current: "2026/11/1", rows: {} });
    expect(await fetchTransactions(page, { since: "2026-11-01", until: "2026-11-30" })).toEqual([]);
  });

  test(".list_body が無ければ 0 件ではなく ELEMENT_NOT_FOUND で止まる", async () => {
    const { page } = fakeCf({ current: "2026/11/1", rows: { "2026/10/1": 3 }, listBody: false });
    const e = await rejection(
      fetchTransactions(page, { since: "2026-10-01", until: "2026-10-31" }),
    );
    expect(e).toBeInstanceOf(AppError);
    expect(e.exitCode).toBe(EXIT.ELEMENT_NOT_FOUND);
    expect(e.message).toContain("(.list_body) not found on /cf");
  });
});

test("timeout 以外の失敗は ELEMENT_NOT_FOUND に読み替えずにそのまま投げる", async () => {
  const closed = new Error("Target page, context or browser has been closed");
  const { page } = fakeCf({ current: "2026/11/1", rows: {}, waitError: closed });
  expect(
    await rejection(fetchTransactions(page, { since: "2026-11-01", until: "2026-11-30" })),
  ).toBe(closed as AppError);
});

describe("pastMonths", () => {
  test("前月から遡り、年を跨ぐ", () => {
    expect(pastMonths(new Date(2026, 1, 10), 3)).toEqual(["2026/1/1", "2025/12/1", "2025/11/1"]);
  });
});

describe("fetchCategoryMeta", () => {
  test("当月に行があれば過去月を取りに行かない", async () => {
    const { page, fetched } = fakeCf({ current: "2026/11/1", rows: { "2026/11/1": 1 } });
    await fetchCategoryMeta(page, new Date(2026, 10, 1));
    expect(fetched).toEqual([]);
  });

  test("当月が 0 件なら行のある月まで遡ってから読む", async () => {
    const { page, fetched } = fakeCf({ current: "2026/11/1", rows: { "2026/9/1": 2 } });
    const meta = await fetchCategoryMeta(page, new Date(2026, 10, 1));
    expect(fetched).toEqual(["2026/10/1", "2026/9/1"]);
    expect(meta.large).toEqual([{ id: "1", name: "食費" }]);
  });

  test(".list_body が無ければ行を探さずに ELEMENT_NOT_FOUND で止まる", async () => {
    const { page } = fakeCf({ current: "2026/11/1", rows: { "2026/11/1": 1 }, listBody: false });
    const e = await rejection(fetchCategoryMeta(page, new Date(2026, 10, 1)));
    expect(e.exitCode).toBe(EXIT.ELEMENT_NOT_FOUND);
    expect(e.message).toContain("(.list_body) not found on /cf");
  });

  test("12 か月遡っても行が無ければ ELEMENT_NOT_FOUND で止まる", async () => {
    const { page, fetched } = fakeCf({ current: "2026/11/1", rows: { "2025/10/1": 1 } });
    const e = await rejection(fetchCategoryMeta(page, new Date(2026, 10, 1)));
    expect(e).toBeInstanceOf(AppError);
    expect(e.exitCode).toBe(EXIT.ELEMENT_NOT_FOUND);
    expect(e.message).toContain("no transactions in the last 12 months");
    expect(fetched.length).toBe(12);
  });
});
