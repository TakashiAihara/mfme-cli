import { launch } from "../browser.ts";
import { saveSession } from "../session.ts";
import { HOST_ME, URL_SIGN_IN } from "../scraper/urls.ts";
import { log } from "../log.ts";
import { EXIT } from "../types.ts";

export async function runLogin(): Promise<number> {
  const handle = await launch({ headed: true, requireSession: false });
  const page = await handle.context.newPage();

  log.info("ブラウザでログインしてください (MFA 含む)。ME 側に戻ってきたら自動で保存します。");
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
    await handle.close();
    return EXIT.AUTH_FAILED;
  }

  const storageState = await handle.context.storageState();
  await saveSession(storageState);
  log.info(`セッションを保存しました (final URL: ${page.url()})`);
  await handle.close();
  return EXIT.OK;
}
