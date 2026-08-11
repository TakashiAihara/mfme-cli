import { chromium, type Browser, type BrowserContext } from "playwright";
import { AppError } from "./errors.ts";
import { loadSession } from "./session.ts";
import { EXIT } from "./types.ts";

export type BrowserHandle = {
  browser: Browser;
  context: BrowserContext;
  close(): Promise<void>;
};

export type LaunchOptions = {
  headed?: boolean;
  requireSession?: boolean;
};

// headless chromium の素の UA だと ME 側で弾かれるので固定値で偽装する
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export async function launch(opts: LaunchOptions = {}): Promise<BrowserHandle> {
  const browser = await chromium.launch({ headless: !opts.headed });
  const sessionPath = await loadSession();

  if (opts.requireSession && !sessionPath) {
    await browser.close();
    // セッション切れ (assertAuthenticated) と同じ「認証まわりで実行できない」状態なので
    // 同じ AUTH_FAILED を返す。素の Error だと呼び出し側で UNKNOWN(4) に落ちる
    throw new AppError("session not found. run `mfme login` first.", EXIT.AUTH_FAILED);
  }

  const context = await browser.newContext({
    userAgent: UA,
    ...(sessionPath ? { storageState: sessionPath } : {}),
  });

  return {
    browser,
    context,
    async close() {
      await context.close();
      await browser.close();
    },
  };
}
