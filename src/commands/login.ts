import { chromium } from "playwright";
import { saveSession } from "../session.ts";
import { HOST_ME, URL_SIGN_IN } from "../scraper/urls.ts";
import { log } from "../log.ts";

export async function runLogin(): Promise<number> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  log.info("ブラウザでログインしてください (MFA 含む)。Moneyforward ME のホームに到達したら自動で保存します。");
  await page.goto(URL_SIGN_IN);

  try {
    await page.waitForURL((u) => {
      const url = new URL(u.toString());
      return url.host === HOST_ME && !url.pathname.startsWith("/sign_in");
    }, { timeout: 10 * 60_000 });
  } catch {
    log.error("ログイン待機がタイムアウトしました");
    await browser.close();
    return 1;
  }

  const storageState = await context.storageState();
  await saveSession(storageState);
  log.info("セッションを保存しました");
  await browser.close();
  return 0;
}
