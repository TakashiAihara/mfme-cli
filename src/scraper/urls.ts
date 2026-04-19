export const URL_SIGN_IN = "https://id.moneyforward.com/sign_in";
export const URL_HOME = "https://moneyforward.com/";
export const HOST_ID = "id.moneyforward.com";
export const HOST_ME = "moneyforward.com";
export const URL_CF = "https://moneyforward.com/cf";
export const URL_ACCOUNTS = "https://moneyforward.com/accounts";

export function urlCfForMonth(yyyyMm: string): string {
  return `${URL_CF}?month=${yyyyMm}`;
}
