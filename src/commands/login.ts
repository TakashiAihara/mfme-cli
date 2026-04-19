import { chromium } from "playwright";
import { saveSession } from "../session.ts";
import { HOST_ID, HOST_ME, URL_HOME, URL_SIGN_IN } from "../scraper/urls.ts";
import { log } from "../log.ts";

export async function runLogin(): Promise<number> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  log.info("ブラウザでログインしてください (MFA 含む)。ID 側 /me に着いたら自動で ME へ遷移します。");
  await page.goto(URL_SIGN_IN);

  try {
    await page.waitForURL((u) => {
      const url = new URL(u.toString());
      return url.host === HOST_ID && url.pathname === "/me";
    }, { timeout: 10 * 60_000 });
  } catch {
    log.error("ログイン待機がタイムアウトしました");
    await browser.close();
    return 1;
  }

  log.info("ID 認証を通過。Moneyforward ME へ遷移してセッションを確立します…");
  await page.goto(URL_HOME, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForURL((u) => new URL(u.toString()).host === HOST_ME, { timeout: 60_000 });
  } catch {
    log.error("ME への遷移に失敗しました");
    await browser.close();
    return 1;
  }

  const storageState = await context.storageState();
  await saveSession(storageState);
  log.info("セッションを保存しました");
  await browser.close();
  return 0;
}
