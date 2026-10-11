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

// commander が負数を値として受けるかは CLI を通さないと分からない。入力検証はブラウザ起動前に終わる
// commander が負数を値として受けることを両フラグで見る。--min-amount から先に検証するので、
// 負数が検証まで通ったことまで分かるのは --min-amount を負数にしたほうだけ
for (const [negative, invalid] of [
  ["--max-amount", "--min-amount"],
  ["--min-amount", "--max-amount"],
]) {
  test(`${negative} の負数を値として受け、不正な ${invalid} で exit 3`, () => {
    const root = resolve(import.meta.dir, "..");
    const proc = Bun.spawnSync([
      "bun",
      "run",
      join(root, "src/cli.ts"),
      "list",
      negative!,
      "-1000",
      invalid!,
      "x",
    ]);

    expect(proc.exitCode).toBe(3);
    expect(proc.stderr.toString()).toBe(`invalid ${invalid}: x\n`);
  }, 30_000);
}
