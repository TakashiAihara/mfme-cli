import { describe, expect, test } from "bun:test";
import {
  applyBatchEntries,
  batchExitCode,
  parseUpdateLines,
  resolveBatchEntries,
} from "./update.ts";
import type { BatchEntry, BatchResult } from "./update.ts";
import type { CategoryMeta } from "../types.ts";
import { EXIT } from "../types.ts";

const meta: CategoryMeta = {
  large: [{ id: "L1", name: "食費" }],
  middle: [
    { id: "M1", name: "カフェ", largeId: "L1" },
    { id: "M2", name: "ランチ", largeId: "L1" },
  ],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const noop = (): void => {};

describe("parseUpdateLines", () => {
  test("1 行 1 レコードでパースする", () => {
    const input =
      '{"txId":"tx_1","category":"食費/カフェ","memo":"スタバ"}\n{"txId":"tx_2","memo":"メモのみ"}\n';

    expect(parseUpdateLines(input)).toEqual([
      { ok: true, txId: "tx_1", memo: "スタバ", category: "食費/カフェ" },
      { ok: true, txId: "tx_2", memo: "メモのみ" },
    ]);
  });

  test("空行 / 空白のみの行はスキップする", () => {
    const input = '\n  \n{"txId":"tx_1","memo":"a"}\n\n';

    expect(parseUpdateLines(input)).toEqual([{ ok: true, txId: "tx_1", memo: "a" }]);
  });

  test("未知フィールドは無視する (list --format ndjson の余剰列)", () => {
    const input = '{"id":"tx_9","date":"2026-01-15","amount":500,"txId":"tx_1","memo":"a"}';

    expect(parseUpdateLines(input)).toEqual([{ ok: true, txId: "tx_1", memo: "a" }]);
  });

  test("memo:null は未指定扱い (category があれば通る)", () => {
    const input = '{"txId":"tx_1","memo":null,"category":"食費/カフェ"}';

    expect(parseUpdateLines(input)).toEqual([{ ok: true, txId: "tx_1", category: "食費/カフェ" }]);
  });

  test("不正な JSON は行単位の失敗として残り、後続行は処理される", () => {
    const input = '{"txId":"tx_1","memo":"a"}\nnot json\n{"txId":"tx_2","memo":"b"}';
    const lines = parseUpdateLines(input);

    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ ok: true, txId: "tx_1" });
    expect(lines[1]?.ok).toBe(false);
    expect(lines[1]).toMatchObject({ ok: false, txId: null });
    expect(lines[2]).toMatchObject({ ok: true, txId: "tx_2" });
  });

  test("行番号は空行を含めた入力全体で数える", () => {
    const lines = parseUpdateLines('\n\nnot json\n{"txId":"tx_1","memo":"a"}');

    expect(lines[0]).toMatchObject({ ok: false, error: expect.stringContaining("line 3") });
  });

  test("JSON オブジェクト以外 (配列 / スカラー) は失敗", () => {
    const lines = parseUpdateLines('[{"txId":"tx_1"}]\n"tx_1"\n123');

    expect(lines.map((l) => l.ok)).toEqual([false, false, false]);
  });

  test("txId 欠落 / 空文字は失敗", () => {
    const lines = parseUpdateLines('{"memo":"a"}\n{"txId":"","memo":"a"}\n{"txId":1,"memo":"a"}');

    expect(lines.map((l) => l.ok)).toEqual([false, false, false]);
    expect(lines[0]).toMatchObject({ error: expect.stringContaining("txId is required") });
  });

  test("memo も category も無い行は失敗し、txId は結果に残る", () => {
    const lines = parseUpdateLines('{"txId":"tx_1"}');

    expect(lines[0]).toMatchObject({ ok: false, txId: "tx_1" });
  });

  test("category がオブジェクト (list 出力そのまま) は失敗", () => {
    const lines = parseUpdateLines(
      '{"txId":"tx_1","category":{"largeName":"食費","middleName":"カフェ"}}',
    );

    expect(lines[0]).toMatchObject({
      ok: false,
      txId: "tx_1",
      error: expect.stringContaining("category"),
    });
  });

  test("memo が文字列以外は失敗", () => {
    const lines = parseUpdateLines('{"txId":"tx_1","memo":123}');

    expect(lines[0]).toMatchObject({ ok: false, txId: "tx_1" });
  });

  test("空文字の category は memo があっても失敗 (黙って無視しない)", () => {
    const lines = parseUpdateLines('{"txId":"tx_1","memo":"a","category":""}');

    expect(lines[0]).toMatchObject({
      ok: false,
      txId: "tx_1",
      error: expect.stringContaining("category must not be empty"),
    });
  });
});

describe("resolveBatchEntries", () => {
  test("category を ID に解決し、memo はそのまま payload に載せる", () => {
    const entries = resolveBatchEntries(
      parseUpdateLines('{"txId":"tx_1","category":"食費/カフェ","memo":"スタバ"}'),
      meta,
    );

    expect(entries).toEqual([
      {
        ok: true,
        txId: "tx_1",
        payload: { memo: "スタバ", largeCategoryId: "L1", middleCategoryId: "M1" },
      },
    ]);
  });

  test("未知カテゴリは行単位の失敗になり、他の行は成功のまま", () => {
    const entries = resolveBatchEntries(
      parseUpdateLines(
        '{"txId":"tx_1","category":"食費/カフェ"}\n{"txId":"tx_2","category":"娯楽費/映画"}\n{"txId":"tx_3","memo":"a"}',
      ),
      meta,
    );

    expect(entries[0]).toMatchObject({ ok: true, txId: "tx_1" });
    expect(entries[1]).toMatchObject({ ok: false, txId: "tx_2" });
    expect(entries[2]).toMatchObject({ ok: true, txId: "tx_3" });
  });

  test("パース失敗行はそのまま持ち越す", () => {
    const entries = resolveBatchEntries(parseUpdateLines("not json"), meta);

    expect(entries[0]).toMatchObject({ ok: false, txId: null });
  });

  test("meta なしで category 指定は行単位の失敗", () => {
    const entries = resolveBatchEntries(
      parseUpdateLines('{"txId":"tx_1","category":"食費/カフェ"}'),
      null,
    );

    expect(entries[0]).toMatchObject({
      ok: false,
      txId: "tx_1",
      error: expect.stringContaining("sync-meta"),
    });
  });
});

describe("applyBatchEntries", () => {
  const entries: BatchEntry[] = [
    { ok: true, txId: "tx_1", payload: { memo: "a" } },
    { ok: true, txId: "tx_2", payload: { memo: "b" } },
    { ok: true, txId: "tx_3", payload: { memo: "c" } },
  ];

  test("途中で失敗しても止まらず全件処理する", async () => {
    const applied: string[] = [];
    const results = await applyBatchEntries(
      entries,
      async (txId) => {
        applied.push(txId);
        if (txId === "tx_2") throw new Error("update failed: HTTP 500");
      },
      noop,
    );

    expect(applied).toEqual(["tx_1", "tx_2", "tx_3"]);
    expect(results).toEqual([
      { ok: true, txId: "tx_1" },
      { ok: false, txId: "tx_2", error: "update failed: HTTP 500" },
      { ok: true, txId: "tx_3" },
    ]);
  });

  test("パース / 解決に失敗した行は apply を呼ばずに結果へ流す", async () => {
    const applied: string[] = [];
    const results = await applyBatchEntries(
      [{ ok: false, txId: null, error: "line 1: invalid JSON" }, ...entries.slice(0, 1)],
      async (txId) => {
        applied.push(txId);
      },
      noop,
    );

    expect(applied).toEqual(["tx_1"]);
    expect(results[0]).toEqual({ ok: false, txId: null, error: "line 1: invalid JSON" });
  });

  test("onResult は 1 件ごとに index / total 付きで呼ばれる", async () => {
    const seen: Array<[number, number, boolean]> = [];
    await applyBatchEntries(
      entries,
      async (txId) => {
        if (txId === "tx_1") throw new Error("boom");
      },
      (result, index, total) => seen.push([index, total, result.ok]),
    );

    expect(seen).toEqual([
      [0, 3, false],
      [1, 3, true],
      [2, 3, true],
    ]);
  });
});

describe("batchExitCode", () => {
  test("全成功は 0", () => {
    const results: BatchResult[] = [
      { ok: true, txId: "tx_1" },
      { ok: true, txId: "tx_2" },
    ];

    expect(batchExitCode(results)).toBe(EXIT.OK);
  });

  test("一部失敗は非 0 (UNKNOWN)", () => {
    const results: BatchResult[] = [
      { ok: true, txId: "tx_1" },
      { ok: false, txId: "tx_2", error: "update failed: HTTP 500" },
    ];

    expect(batchExitCode(results)).toBe(EXIT.UNKNOWN);
    expect(batchExitCode(results)).not.toBe(EXIT.OK);
  });

  test("パースできない行しか無い場合も非 0", () => {
    expect(batchExitCode(resolveBatchEntries(parseUpdateLines("not json"), meta))).toBe(
      EXIT.UNKNOWN,
    );
  });

  test("dry-run のプラン (BatchEntry) にも同じ判定を使える", () => {
    const entries = resolveBatchEntries(
      parseUpdateLines('{"txId":"tx_1","category":"食費/カフェ"}\n{"txId":"tx_2"}'),
      meta,
    );

    expect(batchExitCode(entries)).toBe(EXIT.UNKNOWN);
  });
});
