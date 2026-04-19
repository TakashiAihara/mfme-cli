import { chromium, type Browser, type BrowserContext } from "playwright";
import { loadSession } from "./session.ts";

export interface BrowserHandle {
  browser: Browser;
  context: BrowserContext;
  close(): Promise<void>;
}

export interface LaunchOptions {
  headed?: boolean;
  requireSession?: boolean;
}

// headless chromium の素の UA だと ME 側で弾かれるので固定値で偽装する
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export async function launch(opts: LaunchOptions = {}): Promise<BrowserHandle> {
  const browser = await chromium.launch({ headless: !opts.headed });
  const sessionPath = await loadSession();

  if (opts.requireSession && !sessionPath) {
    await browser.close();
    throw new Error("session not found. run `mfme login` first.");
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
