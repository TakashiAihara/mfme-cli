import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppError } from "../errors.ts";
import { EXIT } from "../types.ts";

// launch() を差し替えて「newPage() が throw する」「launch() 自体が throw する」状況を作り、
// handle.close() が必ず呼ばれることと exit code を検査する。
// 実ブラウザは起動しない (CI は playwright install を実行しない)
let closeCalls = 0;
let launchError: Error | null = null;
let newPageError: Error | null = null;

mock.module("../browser.ts", () => ({
  launch: async () => {
    if (launchError) throw launchError;
    return {
      browser: {},
      context: {
        newPage: async () => {
          if (newPageError) throw newPageError;
          return {};
        },
        storageState: async () => ({}),
      },
      close: async () => {
        closeCalls++;
      },
    };
  },
}));

const { runList } = await import("./list.ts");
const { runSyncMeta } = await import("./sync-meta.ts");
const { runLogin } = await import("./login.ts");
const { runUpdate } = await import("./update.ts");

const commands: Array<{ name: string; run: () => Promise<number> }> = [
  { name: "runList", run: () => runList({ format: "json" }) },
  { name: "runSyncMeta", run: () => runSyncMeta() },
  { name: "runLogin", run: () => runLogin() },
  { name: "runUpdate", run: () => runUpdate({ txId: "tx_1", memo: "m", dryRun: false }) },
];

beforeEach(() => {
  closeCalls = 0;
  launchError = null;
  newPageError = null;
});

describe("newPage() が throw したとき", () => {
  for (const { name, run } of commands) {
    test(`${name}: handle.close() を必ず呼ぶ`, async () => {
      newPageError = new Error("newPage failed");

      await run();

      expect(closeCalls).toBe(1);
    });

    test(`${name}: 例外を投げずに exit code を返す`, async () => {
      newPageError = new Error("newPage failed");

      await expect(run()).resolves.toBe(EXIT.UNKNOWN);
    });
  }
});

describe("launch() 自体が throw したとき", () => {
  for (const { name, run } of commands) {
    test(`${name}: AppError の exitCode をそのまま返す`, async () => {
      launchError = new AppError("session not found", EXIT.AUTH_FAILED);

      await expect(run()).resolves.toBe(EXIT.AUTH_FAILED);
      expect(closeCalls).toBe(0);
    });
  }
});
