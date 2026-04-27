import { chromium } from "playwright";
import { saveSession } from "../session.ts";
import { HOST_ME, URL_SIGN_IN } from "../scraper/urls.ts";
import { log } from "../log.ts";

export async function runLogin(): Promise<number> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  log.info("ブラウザでログインしてください (MFA 含む)。ME 側に戻ってきたら自動で保存します。");
  // ME の /sign_in → SSO で id.moneyforward.com へ → 認証後に ME の認証済みページへ戻る
  await page.goto(URL_SIGN_IN);

  try {
    await page.waitForURL(
      (u) => {
        const url = new URL(u.toString());
        return url.host === HOST_ME && !url.pathname.startsWith("/sign_in");
      },
      { timeout: 10 * 60_000 },
    );
  } catch {
    log.error("ログイン待機がタイムアウトしました");
    await browser.close();
    return 1;
  }

  const storageState = await context.storageState();
  await saveSession(storageState);
  log.info(`セッションを保存しました (final URL: ${page.url()})`);
  await browser.close();
  return 0;
}
