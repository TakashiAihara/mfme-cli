import type { Page } from "playwright";
import { AppError } from "../errors.ts";
import { EXIT, type Asset } from "../types.ts";
import { assertAuthenticated } from "./auth.ts";
import { parseYen, tableHeader, tableToRecords, type RawRow } from "./table.ts";
import { URL_BS_PORTFOLIO } from "./urls.ts";

export type AssetSection = { title: string; rows: RawRow[] };

const ASSET_SECTIONS = 'section[id^="portfolio_det_"]';

const COMMON = {
  institution: "保有金融機関",
  balance: ["残高", "現在の価値"],
  name: ["種類・名称", "名称"],
} as const;

// details から外す列。変更 / 削除はボタンの列で、値として意味が無い
const DROPPED_COLUMNS = new Set(["変更", "削除"]);

function pickColumn(headers: string[], candidates: readonly string[], label: string): string {
  const found = candidates.find((c) => headers.includes(c));
  if (found === undefined) {
    throw new AppError(`column ${label} not found`, EXIT.ELEMENT_NOT_FOUND);
  }
  return found;
}

// 節ごとに列の並びが違う (預金は「残高」、ポイントは「名称」と「現在の価値」) ので、
// 節の見出しを type にし、名称・残高・金融機関の 3 列を固定の項目に、残りは details に入れる
function parseSection(section: AssetSection): Asset[] {
  const headers = tableHeader(section.rows);
  const nameCol = pickColumn(headers, COMMON.name, `"${COMMON.name.join('" or "')}"`);
  const balanceCol = pickColumn(headers, COMMON.balance, `"${COMMON.balance.join('" or "')}"`);
  pickColumn(headers, [COMMON.institution], `"${COMMON.institution}"`);
  const fixed = new Set([nameCol, balanceCol, COMMON.institution]);

  return tableToRecords(section.rows).map((r) => ({
    type: section.title,
    name: r[nameCol] ?? "",
    balance: parseYen(r[balanceCol] ?? ""),
    institution: r[COMMON.institution] ?? "",
    details: Object.fromEntries(
      Object.entries(r).filter(([k]) => !fixed.has(k) && !DROPPED_COLUMNS.has(k)),
    ),
  }));
}

// 1 節の読み取りが失敗しても他の節は出す。失敗した節は丸ごと落とし、理由を残す
export function parseAssets(sections: AssetSection[]): {
  assets: Asset[];
  failures: Array<{ section: string; reason: string }>;
} {
  const assets: Asset[] = [];
  const failures: Array<{ section: string; reason: string }> = [];
  for (const section of sections) {
    // 見出しは type の唯一の出どころなので、取れなければ種類の無い資産を出さずに節ごと止める
    if (section.title === "") {
      failures.push({ section: section.title, reason: "section title not found" });
      continue;
    }
    if (section.rows.length === 0) {
      failures.push({ section: section.title, reason: "table not found" });
      continue;
    }

    try {
      assets.push(...parseSection(section));
    } catch (e) {
      failures.push({
        section: section.title,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { assets, failures };
}

export async function fetchAssetSections(page: Page): Promise<AssetSection[]> {
  await page.goto(URL_BS_PORTFOLIO, { waitUntil: "domcontentloaded" });
  await assertAuthenticated(page);
  if ((await page.$("#bs-portfolio")) === null) {
    throw new AppError(
      "asset page layout changed: #bs-portfolio not found",
      EXIT.ELEMENT_NOT_FOUND,
    );
  }
  const raw = await page.$$eval(ASSET_SECTIONS, (sections) =>
    sections.map((section) => ({
      title: section.querySelector("h1")?.textContent ?? "",
      rows: Array.from(
        section.querySelector("table.table-bordered")?.querySelectorAll("tr") ?? [],
      ).map((tr) => ({
        classes: Array.from(tr.classList),
        cells: Array.from(tr.children)
          .filter((el) => el.tagName === "TH" || el.tagName === "TD")
          .map((el) => ({
            tag: el.tagName.toLowerCase() as "th" | "td",
            classes: Array.from(el.classList),
            text: el.textContent ?? "",
          })),
      })),
    })),
  );
  // 資産 0 件のときに節が出るかは確かめていない。節が 1 つも無いのを 0 件と読むと、
  // 画面の作りが変わったときに空の結果で成功してしまうので止める
  if (raw.length === 0) {
    throw new AppError(`asset section not found: ${ASSET_SECTIONS}`, EXIT.ELEMENT_NOT_FOUND);
  }
  return raw.map((s) => ({ title: s.title.replace(/\s+/g, " ").trim(), rows: s.rows }));
}
