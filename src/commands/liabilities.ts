import { launch } from "../browser.ts";
import { AppError } from "../errors.ts";
import { fetchLiabilities } from "../scraper/liabilities.ts";
import { log } from "../log.ts";
import { EXIT, type Liability } from "../types.ts";

export type LiabilitiesArgs = {
  format: "json" | "ndjson" | "csv";
};

export function toLiabilityCsvRow(l: Liability): string {
  return [l.type, l.name, l.balance, l.institution]
    .map((v) => `"${String(v).replaceAll('"', '""')}"`)
    .join(",");
}

export async function runLiabilities(args: LiabilitiesArgs): Promise<number> {
  try {
    const handle = await launch({ requireSession: true });
    try {
      const page = await handle.context.newPage();
      const items = await fetchLiabilities(page);
      if (args.format === "ndjson") {
        for (const item of items) process.stdout.write(JSON.stringify(item) + "\n");
      } else if (args.format === "csv") {
        process.stdout.write("type,name,balance,institution\n");
        for (const item of items) {
          process.stdout.write(toLiabilityCsvRow(item) + "\n");
        }
      } else {
        process.stdout.write(JSON.stringify(items, null, 2) + "\n");
      }
      return EXIT.OK;
    } finally {
      await handle.close();
    }
  } catch (e) {
    log.error(e instanceof Error ? e.message : String(e));
    return e instanceof AppError ? e.exitCode : EXIT.UNKNOWN;
  }
}
