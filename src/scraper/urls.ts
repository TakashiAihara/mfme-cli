export const URL_SIGN_IN = "https://moneyforward.com/sign_in/email";
export const URL_HOME = "https://moneyforward.com/";
export const URL_CF = "https://moneyforward.com/cf";
export const URL_ACCOUNTS = "https://moneyforward.com/accounts";

export function urlCfForMonth(yyyyMm: string): string {
  return `${URL_CF}?month=${yyyyMm}`;
}
