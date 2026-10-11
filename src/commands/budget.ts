import { launch } from "../browser.ts";
import { AppError } from "../errors.ts";
import { fetchBudget, monthOffset, toBudgetLines } from "../scraper/budget.ts";
import { log } from "../log.ts";
import { EXIT, type BudgetLine } from "../types.ts";

export type BudgetArgs = {
  month?: string;
  format: "json" | "ndjson" | "csv";
};

export function toBudgetCsvRow(l: BudgetLine): string {
  return [l.month, l.kind, l.largeName, l.spent, l.remaining, l.budget]
    .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`)
    .join(",");
}

export async function runBudget(args: BudgetArgs): Promise<number> {
  try {
    // 入力の誤りはブラウザを起動する前に止める
    const today = new Date();
    const month =
      args.month ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const offset = monthOffset(month, today);
    const handle = await launch({ requireSession: true });
    try {
      const page = await handle.context.newPage();
      const budget = await fetchBudget(page, offset, month);
      if (args.format === "json") {
        process.stdout.write(JSON.stringify(budget, null, 2) + "\n");
      } else {
        const lines = toBudgetLines(budget);
        if (args.format === "ndjson") {
          for (const line of lines) process.stdout.write(JSON.stringify(line) + "\n");
        } else {
          process.stdout.write("month,kind,largeName,spent,remaining,budget\n");
          for (const line of lines) process.stdout.write(toBudgetCsvRow(line) + "\n");
        }
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
