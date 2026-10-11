import { launch } from "../browser.ts";
import { AppError } from "../errors.ts";
import { fetchAssetSections, parseAssets } from "../scraper/assets.ts";
import { log } from "../log.ts";
import { EXIT, type Asset, type ExitCode } from "../types.ts";

export type AssetsArgs = {
  format: "json" | "ndjson" | "csv";
};

export function toAssetCsvRow(a: Asset): string {
  return [a.type, a.name, a.balance, a.institution]
    .map((v) => `"${String(v).replaceAll('"', '""')}"`)
    .join(",");
}

// 読めなかった節が 1 つあっても他の節は出し続ける。ただし出力が一部だけだと無人の呼び出し元に
// 伝わらないので、exit code は 4 にして「途中まで」であることを残す
export function reportAssetFailures(
  failures: Array<{ section: string; reason: string }>,
): ExitCode {
  for (const f of failures) {
    log.warn(`asset section "${f.section}" skipped: ${f.reason}`);
  }
  return failures.length > 0 ? EXIT.UNKNOWN : EXIT.OK;
}

export async function runAssets(args: AssetsArgs): Promise<number> {
  try {
    const handle = await launch({ requireSession: true });
    try {
      const page = await handle.context.newPage();
      const { assets, failures } = parseAssets(await fetchAssetSections(page));
      if (args.format === "ndjson") {
        for (const item of assets) process.stdout.write(JSON.stringify(item) + "\n");
      } else if (args.format === "csv") {
        process.stdout.write("type,name,balance,institution\n");
        for (const item of assets) {
          process.stdout.write(toAssetCsvRow(item) + "\n");
        }
      } else {
        process.stdout.write(JSON.stringify(assets, null, 2) + "\n");
      }
      return reportAssetFailures(failures);
    } finally {
      await handle.close();
    }
  } catch (e) {
    log.error(e instanceof Error ? e.message : String(e));
    return e instanceof AppError ? e.exitCode : EXIT.UNKNOWN;
  }
}
