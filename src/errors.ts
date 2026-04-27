import type { ExitCode } from "./types.ts";

export class AppError extends Error {
  constructor(
    message: string,
    readonly exitCode: ExitCode,
  ) {
    super(message);
    this.name = "AppError";
  }
}
