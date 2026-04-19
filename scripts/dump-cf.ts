import { writeFile } from "node:fs/promises";
import { launch } from "../src/browser.ts";

const handle = await launch({ requireSession: true });
const page = await handle.context.newPage();

await page.goto("https://moneyforward.com/cf", { waitUntil: "domcontentloaded" });
await page.waitForSelector("tr.transaction_list", { timeout: 10_000 });

const result = await page.evaluate(async () => {
  const token = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? "";
  const res = await fetch("/cf/fetch", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "X-CSRF-Token": token,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "text/javascript, application/javascript, */*; q=0.01",
    },
    body: "from=2026/3/1&service_id=&account_id_hash=",
  });
  const text = await res.text();
  return { status: res.status, ct: res.headers.get("content-type"), len: text.length, head: text.slice(0, 800) };
});
console.error(JSON.stringify(result, null, 2));

await handle.close();
