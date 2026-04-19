import { chromium } from "playwright";
import { saveSession } from "../session.ts";
import { HOST_ID, HOST_ME, URL_HOME, URL_SIGN_IN } from "../scraper/urls.ts";
import { log } from "../log.ts";

export async function runLogin(): Promise<number> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  log.info("ブラウザでログインしてください (MFA 含む)。ID 認証を通過したら自動で ME へ遷移します。");
  await page.goto(URL_SIGN_IN);

  try {
    await page.waitForURL((u) => {
      const url = new URL(u.toString());
      if (url.host === HOST_ID && !url.pathname.startsWith("/sign_in")) return true;
      if (url.host === HOST_ME && !url.pathname.startsWith("/sign_in")) return true;
      return false;
    }, { timeout: 10 * 60_000 });
  } catch {
    log.error("ログイン待機がタイムアウトしました");
    await browser.close();
    return 1;
  }

  if (new URL(page.url()).host === HOST_ID) {
    log.info("ID 認証を通過。Moneyforward ME へ遷移してセッションを確立します…");
    await page.goto(URL_HOME, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForURL((u) => new URL(u.toString()).host === HOST_ME, { timeout: 60_000 });
    } catch {
      log.error("ME への遷移に失敗しました");
      await browser.close();
      return 1;
    }
  }

  const storageState = await context.storageState();
  await saveSession(storageState);
  log.info("セッションを保存しました");
  await browser.close();
  return 0;
}
