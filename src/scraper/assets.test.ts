import { describe, expect, test } from "bun:test";
import { fetchAssetSections, parseAssets, type AssetSection } from "./assets.ts";
import type { RawRow } from "./table.ts";

const th = (text: string) => ({ tag: "th" as const, classes: [], text });
const td = (text: string) => ({ tag: "td" as const, classes: [], text });
const row = (...cells: RawRow["cells"]): RawRow => ({ classes: [], cells });

// /bs/portfolio の節ごとの明細表と同じ列の並び (2026-10-11 に実ページで確認した 2 種類)
const depo: AssetSection = {
  title: "預金・現金",
  rows: [
    row(th("種類・名称"), th("残高"), th("保有金融機関"), th("変更"), th("削除")),
    row(td("普通預金"), td("120,000円"), td("A 銀行"), td("×"), td("")),
    row(td("財布"), td("3,400円"), td("財布"), td(""), td("")),
  ],
};
const points: AssetSection = {
  title: "ポイント",
  rows: [
    row(
      th("名称"),
      th("種類"),
      th("ポイント・マイル数"),
      th("換算レート"),
      th("現在の価値"),
      th("有効期限"),
      th("保有金融機関"),
      th("変更"),
      th("削除"),
    ),
    row(
      td("P1"),
      td("ポイント"),
      td("1,500ポイント"),
      td("1"),
      td("1,500円"),
      td(""),
      td("C カード"),
      td(""),
      td(""),
    ),
  ],
};

describe("parseAssets", () => {
  test("節の見出しを type、共通 4 列とそれ以外の列を details にする", () => {
    expect(parseAssets([depo, points])).toEqual({
      assets: [
        {
          type: "預金・現金",
          name: "普通預金",
          balance: 120000,
          institution: "A 銀行",
          details: {},
        },
        { type: "預金・現金", name: "財布", balance: 3400, institution: "財布", details: {} },
        {
          type: "ポイント",
          name: "P1",
          balance: 1500,
          institution: "C カード",
          details: {
            種類: "ポイント",
            "ポイント・マイル数": "1,500ポイント",
            換算レート: "1",
            有効期限: "",
          },
        },
      ],
      failures: [],
    });
  });

  test("明細の無い節は何も足さない", () => {
    expect(parseAssets([{ title: "預金・現金", rows: [depo.rows[0]!] }])).toEqual({
      assets: [],
      failures: [],
    });
  });

  test("節に表が無ければ、その節を failures に回す", () => {
    expect(parseAssets([{ title: "暗号資産", rows: [] }, points])).toEqual({
      assets: [
        {
          type: "ポイント",
          name: "P1",
          balance: 1500,
          institution: "C カード",
          details: {
            種類: "ポイント",
            "ポイント・マイル数": "1,500ポイント",
            換算レート: "1",
            有効期限: "",
          },
        },
      ],
      failures: [{ section: "暗号資産", reason: "table not found" }],
    });
  });

  test("節が 1 つも無ければ空", () => {
    expect(parseAssets([])).toEqual({ assets: [], failures: [] });
  });

  test("残高の列が見つからない節は failures に回し、他の節は出す", () => {
    const stock: AssetSection = {
      title: "株式(現物)",
      rows: [
        row(th("銘柄名"), th("評価額"), th("保有金融機関")),
        row(td("X"), td("9円"), td("D 証券")),
      ],
    };
    expect(parseAssets([stock, depo])).toEqual({
      assets: [
        {
          type: "預金・現金",
          name: "普通預金",
          balance: 120000,
          institution: "A 銀行",
          details: {},
        },
        { type: "預金・現金", name: "財布", balance: 3400, institution: "財布", details: {} },
      ],
      failures: [{ section: "株式(現物)", reason: 'column "種類・名称" or "名称" not found' }],
    });
  });

  test("金額が読めない行がある節は、その節ごと failures に回す", () => {
    const broken: AssetSection = {
      title: "預金・現金",
      rows: [depo.rows[0]!, depo.rows[1]!, row(td("壊れ"), td("??"), td("Z"), td(""), td(""))],
    };
    expect(parseAssets([broken, points]).failures).toEqual([
      { section: "預金・現金", reason: 'unexpected amount: "??"' },
    ]);
    expect(parseAssets([broken, points]).assets.map((a) => a.name)).toEqual(["P1"]);
  });

  for (const [missing, reason] of [
    ["残高", 'column "残高" or "現在の価値" not found'],
    ["保有金融機関", 'column "保有金融機関" not found'],
  ] as const) {
    test(`列 ${missing} が無い節の理由`, () => {
      const names = ["種類・名称", "残高", "保有金融機関"].filter((n) => n !== missing);
      const s: AssetSection = {
        title: "T",
        rows: [row(...names.map(th)), row(...names.map(() => td("1円")))],
      };
      expect(parseAssets([s]).failures).toEqual([{ section: "T", reason }]);
    });
  }
});

describe("fetchAssetSections", () => {
  function fakePage(opts: { url?: string; root: boolean; sections: AssetSection[] }) {
    const calls: string[] = [];
    const page = {
      goto: async (u: string) => {
        calls.push(`goto ${u}`);
      },
      url: () => opts.url ?? "https://moneyforward.com/bs/portfolio",
      $: async (sel: string) => {
        calls.push(`$ ${sel}`);
        return opts.root ? {} : null;
      },
      $$eval: async (sel: string) => {
        calls.push(`$$eval ${sel}`);
        return opts.sections;
      },
    };
    return { page: page as unknown as Parameters<typeof fetchAssetSections>[0], calls };
  }

  test("節の見出しの空白を詰めて返す", async () => {
    const { page, calls } = fakePage({
      root: true,
      sections: [{ title: "  預金・\n現金 ", rows: [] }],
    });
    expect(await fetchAssetSections(page)).toEqual([{ title: "預金・ 現金", rows: [] }]);
    expect(calls).toEqual([
      "goto https://moneyforward.com/bs/portfolio",
      "$ #bs-portfolio",
      '$$eval section[id^="portfolio_det_"]',
    ]);
  });

  test("節が 1 つも無ければ 0 件にせず ELEMENT_NOT_FOUND(2)", async () => {
    const { page } = fakePage({ root: true, sections: [] });
    await expect(fetchAssetSections(page)).rejects.toThrow(
      'asset section not found: section[id^="portfolio_det_"]',
    );
  });

  test("#bs-portfolio が無ければ ELEMENT_NOT_FOUND(2)", async () => {
    const { page } = fakePage({ root: false, sections: [depo] });
    await expect(fetchAssetSections(page)).rejects.toThrow(
      "asset page layout changed: #bs-portfolio not found",
    );
  });
});
