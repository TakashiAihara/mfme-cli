// ME の /sign_in に入ると id.moneyforward.com へリダイレクト→認証完了後に ME へ戻る
// SSO ラウンドトリップで _moneybook_session が確立される
export const URL_SIGN_IN = "https://moneyforward.com/sign_in";
export const URL_HOME = "https://moneyforward.com/cf";
export const HOST_ID = "id.moneyforward.com";
export const HOST_ME = "moneyforward.com";
export const URL_CF = "https://moneyforward.com/cf";
export const URL_ACCOUNTS = "https://moneyforward.com/accounts";

export function urlCfForMonth(yyyyMm: string): string {
  return `${URL_CF}?month=${yyyyMm}`;
}
