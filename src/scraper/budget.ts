import type { Page } from "playwright";
import { AppError } from "../errors.ts";
import { EXIT, type Budget, type BudgetLine, type BudgetRow } from "../types.ts";
import { assertAuthenticated } from "./auth.ts";
import { parseYen, readRows, type RawCell, type RawRow } from "./table.ts";
import { URL_SPENDING_SUMMARIES } from "./urls.ts";

const BUDGET_TABLE = "#budgets-progress table tr";
// 表の上に出る集計期間 ("2026/09/01-2026/09/30")。2026-10-11 に実ページで確認
const BUDGET_RANGE = ".date_range .msg";

// 月の開始日を 1 日以外にしていると期間が 2 か月にまたがり、--month の月とどう対応するか確かめられないので止める
export function monthFromRange(text: string): string {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})\s*-\s*(\d{4})\/(\d{2})\/\d{2}$/.exec(text.trim());
  if (m === null) {
    throw new AppError(`unexpected budget period: ${JSON.stringify(text)}`, EXIT.ELEMENT_NOT_FOUND);
  }
  if (m[3] !== "01" || m[1] !== m[4] || m[2] !== m[5]) {
    throw new AppError(
      `budget period is not a calendar month (month start day changed?): ${text.trim()}`,
      EXIT.ELEMENT_NOT_FOUND,
    );
  }
  return `${m[1]}/${m[2]}`;
}

function cell(row: RawRow, tag: "th" | "td", cls?: string): RawCell | undefined {
  return row.cells.find((c) => c.tag === tag && (cls === undefined || c.classes.includes(cls)));
}

function rowName(row: RawRow): string {
  return (cell(row, "th")?.text ?? "").replace(/\s+/g, " ").trim();
}

function budgetRow(row: RawRow): BudgetRow {
  const name = rowName(row);
  const spent = cell(row, "td", "amount");
  if (spent === undefined) {
    throw new AppError(`budget row "${name}": td.amount not found`, EXIT.ELEMENT_NOT_FOUND);
  }
  const remaining = cell(row, "td", "remaining");
  if (remaining === undefined) {
    throw new AppError(`budget row "${name}": td.remaining not found`, EXIT.ELEMENT_NOT_FOUND);
  }
  const spentYen = parseYen(spent.text);
  const remainingYen = parseYen(remaining.text);
  return { spent: spentYen, remaining: remainingYen, budget: spentYen + remainingYen };
}

// 行の役割は class で決める。見出し行 (budget_header / budget_sub_header) のように役割の無い行は読まない
export function parseBudget(rows: RawRow[], monthLabel: string): Budget {
  const label = /^(\d{4})\/(\d{2})$/.exec(monthLabel);
  if (label === null) {
    throw new AppError(
      `unexpected month label: ${JSON.stringify(monthLabel)}`,
      EXIT.ELEMENT_NOT_FOUND,
    );
  }

  let total: BudgetRow | undefined;
  const groups: Budget["groups"] = [];
  for (const row of rows) {
    if (row.classes.includes("total_expense")) {
      total = budgetRow(row);
    } else if (row.classes.includes("budget_type_total_expense")) {
      const kind = row.classes.includes("variable_type")
        ? "variable"
        : row.classes.includes("fixed_type")
          ? "fixed"
          : null;
      // 区分が分からない小計を飛ばすと、続く大項目が直前の区分に紛れ込むので止める
      if (kind === null) {
        throw new AppError(
          `budget group row "${rowName(row)}": kind not found`,
          EXIT.ELEMENT_NOT_FOUND,
        );
      }
      groups.push({ kind, total: budgetRow(row), categories: [] });
    } else if (row.classes.includes("large_category_expense")) {
      const group = groups.at(-1);
      if (group === undefined) {
        throw new AppError("budget category row before any group", EXIT.ELEMENT_NOT_FOUND);
      }
      group.categories.push({ largeName: rowName(row), ...budgetRow(row) });
    }
  }

  if (total === undefined) {
    throw new AppError("budget total row not found", EXIT.ELEMENT_NOT_FOUND);
  }

  // 小計は配下の行の合計と一致する (使った金額・残りとも、2026-10-11 に 4 か月分で確認)。class が変わって
  // 行を読み落とすと区分が空のまま成功してしまうので、合計が合わなければ止める。使った金額が 0 円の行の
  // 読み落としは残りの側で捕まる
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  if (
    groups.length === 0 ||
    total.spent !== sum(groups.map((g) => g.total.spent)) ||
    groups.some((g) => g.total.spent !== sum(g.categories.map((c) => c.spent))) ||
    total.remaining !== sum(groups.map((g) => g.total.remaining)) ||
    groups.some((g) => g.total.remaining !== sum(g.categories.map((c) => c.remaining)))
  ) {
    throw new AppError("budget rows do not add up to their totals", EXIT.ELEMENT_NOT_FOUND);
  }
  return { month: `${label[1]}-${label[2]}`, total, groups };
}

// 当月を 0 とする。未来の月は offset が負になるので、ブラウザを起動する前に止める
export function monthOffset(month: string, today: Date): number {
  const target = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (target === null) {
    throw new AppError(`invalid --month: ${month}`, EXIT.INVALID_INPUT);
  }
  const offset =
    today.getFullYear() * 12 + today.getMonth() - (Number(target[1]) * 12 + Number(target[2]) - 1);
  if (offset < 0) {
    throw new AppError(`--month is in the future: ${month}`, EXIT.INVALID_INPUT);
  }
  return offset;
}

export function toBudgetLines(b: Budget): BudgetLine[] {
  const lines: BudgetLine[] = [{ month: b.month, kind: "total", largeName: null, ...b.total }];
  for (const group of b.groups) {
    lines.push({ month: b.month, kind: group.kind, largeName: null, ...group.total });
    for (const { largeName, ...row } of group.categories) {
      lines.push({ month: b.month, kind: group.kind, largeName, ...row });
    }
  }
  return lines;
}

export async function fetchBudget(
  page: Page,
  offset: number,
  expectedMonth: string,
): Promise<Budget> {
  await page.goto(`${URL_SPENDING_SUMMARIES}?offset_month=${offset}`, {
    waitUntil: "domcontentloaded",
  });
  await assertAuthenticated(page);
  if ((await page.$("#budgets-progress")) === null) {
    throw new AppError(
      "budget page layout changed: #budgets-progress not found",
      EXIT.ELEMENT_NOT_FOUND,
    );
  }
  // offset_month は今月から何か月前かを数える (2026-10-11 に確認)。意味が変わっても別の月を黙って返さないよう、表示中の集計期間を確かめる
  const ranges = await page.$$(BUDGET_RANGE);
  if (ranges.length !== 1) {
    throw new AppError(
      `budget period not found: expected 1 ${BUDGET_RANGE}, got ${ranges.length}`,
      EXIT.ELEMENT_NOT_FOUND,
    );
  }
  const monthLabel = monthFromRange((await ranges[0]!.textContent()) ?? "");
  const budget = parseBudget(await readRows(page, BUDGET_TABLE), monthLabel);
  if (budget.month !== expectedMonth) {
    throw new AppError(
      `budget page shows ${budget.month}, expected ${expectedMonth}`,
      EXIT.ELEMENT_NOT_FOUND,
    );
  }
  return budget;
}
