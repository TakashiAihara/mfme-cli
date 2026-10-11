import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { AppError } from "./errors.ts";
import { SESSION_FILE } from "./paths.ts";
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

// 案内をそのままコピペして動かすので、パスに $ や " が入っていても展開させない
export function shellQuote(s: string): string {
  return `'${s.replaceAll("'", `'\\''`)}'`;
}

export async function launch(opts: LaunchOptions = {}): Promise<BrowserHandle> {
  // 文言は Playwright の registry (executablePathOrDie) が投げるもの。headless-shell のパスは
  // 公開 API から取れないので、起動前に存在確認をすると別のバイナリを見てしまう
  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: !opts.headed });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Executable doesn't exist")) {
      throw new AppError(
        `browser not installed. run: bun --cwd=${shellQuote(resolve(import.meta.dir, ".."))} run install-browsers`,
        EXIT.BROWSER_MISSING,
      );
    }
    // 文言は Playwright の kNoXServerRunningError。headed の login は画面の無いホストでは開けないので、
    // 画面のある機械で作ったセッションを持ち込む手順を示す
    if (e instanceof Error && e.message.includes("without having a XServer running")) {
      throw new AppError(
        `no display for the login browser. run \`mfme login\` on a machine with a display, then copy its session.json to ${shellQuote(SESSION_FILE)} on this host`,
        EXIT.AUTH_FAILED,
      );
    }
    throw e;
  }

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
