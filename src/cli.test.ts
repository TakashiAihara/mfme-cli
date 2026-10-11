import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, expect, test } from "bun:test";

// ブラウザ未導入は CI でも再現できるので、mock を通さず実際に CLI を起動して exit code まで見る
const emptyBrowsers = mkdtempSync(join(tmpdir(), "mfme-no-browser-"));

afterAll(() => {
  rmSync(emptyBrowsers, { recursive: true, force: true });
});

// bun と Playwright を子プロセスで起動するので、既定の 5 秒では冷えた CI で足りないことがある
test("ブラウザが無ければ exit 5 と導入コマンドの 1 行を出す", () => {
  const root = resolve(import.meta.dir, "..");
  const proc = Bun.spawnSync(["bun", "run", join(root, "src/cli.ts"), "sync-meta"], {
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: emptyBrowsers },
  });

  expect(proc.exitCode).toBe(5);
  expect(proc.stdout.toString()).toBe("");
  expect(proc.stderr.toString()).toContain(
    `browser not installed. run: bun --cwd='${root}' run install-browsers`,
  );
}, 30_000);
