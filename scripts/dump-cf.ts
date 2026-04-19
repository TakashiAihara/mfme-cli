// DOM / セレクタ調査用のアドホック probe。
// `bun run scripts/dump-cf.ts` で /cf の HTML を tmp/ に保存する。
import { writeFile, mkdir } from "node:fs/promises";
import { launch } from "../src/browser.ts";

await mkdir("tmp", { recursive: true });

const handle = await launch({ requireSession: true });
const page = await handle.context.newPage();

await page.goto("https://moneyforward.com/cf", { waitUntil: "domcontentloaded" });
await page.waitForSelector("tr.transaction_list .v_l_ctg", { timeout: 20_000 });
await writeFile("tmp/cf.html", await page.content());

// row の大項目ドロップダウンを展開して全カテゴリ取得状態の HTML を保存
await page.click("tr.transaction_list .v_l_ctg");
await page.waitForFunction(() => document.querySelectorAll("a.l_c_name").length > 0, undefined, { timeout: 10_000 });
await writeFile("tmp/cf-dropdown.html", await page.content());

console.error("saved tmp/cf.html and tmp/cf-dropdown.html");
await handle.close();
