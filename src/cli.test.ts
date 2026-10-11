import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, expect, test } from "bun:test";

// ブラウザ未導入は CI でも再現できるので、mock を通さず実際に CLI を起動して exit code まで見る
const emptyBrowsers = mkdtempSync(join(tmpdir(), "mfme-no-browser-"));

afterAll(() => {
  rmSync(emptyBrowsers, { recursive: true, force: true });
});

// headless の sync-meta と headed の login で、起動する実行ファイルが違う (headless-shell と chromium)。
// bun と Playwright を子プロセスで起動するので、既定の 5 秒では冷えた CI で足りないことがある
for (const command of ["sync-meta", "login"]) {
  test(`${command}: ブラウザが無ければ exit 5 と導入コマンドの 1 行だけを出す`, () => {
    const root = resolve(import.meta.dir, "..");
    const proc = Bun.spawnSync(["bun", "run", join(root, "src/cli.ts"), command], {
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: emptyBrowsers },
    });

    expect(proc.exitCode).toBe(5);
    expect(proc.stdout.toString()).toBe("");
    expect(proc.stderr.toString()).toBe(
      `[error] browser not installed. run: bun --cwd='${root}' run install-browsers\n`,
    );
  }, 30_000);
}

// 未来の月は offset の計算で止まり、ブラウザを起動する前に exit 3 で終わる
test("budget --month 未来の月は起動前に exit 3", () => {
  const root = resolve(import.meta.dir, "..");
  const proc = Bun.spawnSync([
    "bun",
    "run",
    join(root, "src/cli.ts"),
    "budget",
    "--month",
    "2099-01",
  ]);

  expect(proc.exitCode).toBe(3);
  expect(proc.stderr.toString()).toBe("[error] --month is in the future: 2099-01\n");
}, 30_000);

// commander が負数を値として受けるかは CLI を通さないと分からない。min > max のエラーは両方の値が
// 負数のまま検証を通ったときにしか出ないので、負数の受け取りから検証までを 1 回で見られる。
// 入力検証はブラウザ起動前に終わるので CI でも走る
for (const [min, max] of [
  ["0", "-1000"],
  ["-1000", "-2000"],
]) {
  test(`--min-amount ${min} --max-amount ${max} は min > max として exit 3`, () => {
    const root = resolve(import.meta.dir, "..");
    const proc = Bun.spawnSync([
      "bun",
      "run",
      join(root, "src/cli.ts"),
      "list",
      "--min-amount",
      min!,
      "--max-amount",
      max!,
    ]);

    expect(proc.exitCode).toBe(3);
    expect(proc.stderr.toString()).toBe("--min-amount が --max-amount より大きい\n");
  }, 30_000);
}
