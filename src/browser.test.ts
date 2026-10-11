import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppError } from "./errors.ts";
import { EXIT } from "./types.ts";

// 実ブラウザを起動しないよう playwright と session を差し替える。
// CI は `playwright install` を実行しないので、実起動するテストは書けない
let sessionPath: string | null = null;
let browserClosed = false;
let newContextCalled = false;
let launchError: Error | null = null;

mock.module("playwright", () => ({
  chromium: {
    launch: async () => {
      if (launchError) throw launchError;
      return {
        close: async () => {
          browserClosed = true;
        },
        newContext: async () => {
          newContextCalled = true;
          return { close: async () => {} };
        },
      };
    },
  },
}));

mock.module("./session.ts", () => ({
  loadSession: async () => sessionPath,
  saveSession: async () => {},
  hasSession: async () => sessionPath !== null,
}));

const { launch } = await import("./browser.ts");

beforeEach(() => {
  sessionPath = null;
  browserClosed = false;
  newContextCalled = false;
  launchError = null;
});

describe("launch", () => {
  // セッション切れ (assertAuthenticated) と同じ扱いにする。素の Error だと UNKNOWN(4) に落ちる
  test("requireSession でセッションが無ければ AUTH_FAILED(1) の AppError", async () => {
    let caught: unknown;
    try {
      await launch({ requireSession: true });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).exitCode).toBe(EXIT.AUTH_FAILED);
    expect((caught as AppError).message).toContain("mfme login");
  });

  test("セッションが無くて中断する場合もブラウザを閉じる", async () => {
    await launch({ requireSession: true }).catch(() => {});

    expect(browserClosed).toBe(true);
    expect(newContextCalled).toBe(false);
  });

  test("セッションがあれば context を作って返す", async () => {
    sessionPath = "/tmp/session.json";
    const handle = await launch({ requireSession: true });

    expect(newContextCalled).toBe(true);
    expect(browserClosed).toBe(false);
    expect(typeof handle.close).toBe("function");
  });

  test("requireSession なしならセッションが無くても起動する", async () => {
    const handle = await launch({ requireSession: false });

    expect(newContextCalled).toBe(true);
    expect(typeof handle.close).toBe("function");
  });

  test("ブラウザ未導入なら BROWSER_MISSING(5) の AppError", async () => {
    launchError = new Error(
      "browserType.launch: Executable doesn't exist at /x/chrome-headless-shell",
    );

    let caught: unknown;
    try {
      await launch();
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).exitCode).toBe(5);
    expect((caught as AppError).message).toContain("install-browsers");
    expect((caught as AppError).message).toContain("--cwd=");
    expect((caught as AppError).message).not.toContain("\n");
  });

  test("ブラウザ以外の起動エラーは素の Error をそのまま投げる", async () => {
    const boom = new Error("boom");
    launchError = boom;

    let caught: unknown;
    try {
      await launch();
    } catch (e) {
      caught = e;
    }

    expect(caught).toBe(boom);
    expect(caught).not.toBeInstanceOf(AppError);
  });
});
