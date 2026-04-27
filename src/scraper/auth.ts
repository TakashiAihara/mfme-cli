import type { Page } from "playwright";
import { AppError } from "../errors.ts";
import { EXIT } from "../types.ts";
import { HOST_ME } from "./urls.ts";

export async function assertAuthenticated(page: Page): Promise<void> {
  const url = new URL(page.url());
  if (url.host !== HOST_ME || url.pathname.startsWith("/sign_in")) {
    throw new AppError("session expired. run `mfme login` again.", EXIT.AUTH_FAILED);
  }
}
