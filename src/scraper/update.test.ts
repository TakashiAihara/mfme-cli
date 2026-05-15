import { describe, expect, test } from "bun:test";
import { resolveCategoryIds } from "./update.ts";
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
