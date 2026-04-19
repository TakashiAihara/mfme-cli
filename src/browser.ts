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

export async function launch(opts: LaunchOptions = {}): Promise<BrowserHandle> {
  const browser = await chromium.launch({ headless: !opts.headed });
  const sessionPath = await loadSession();

  if (opts.requireSession && !sessionPath) {
    await browser.close();
    throw new Error("session not found. run `mfme login` first.");
  }

  const context = await browser.newContext(
    sessionPath ? { storageState: sessionPath } : {},
  );

  return {
    browser,
    context,
    async close() {
      await context.close();
      await browser.close();
    },
  };
}
