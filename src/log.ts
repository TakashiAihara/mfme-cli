export const log = {
  info(msg: string): void {
    process.stderr.write(`[info] ${msg}\n`);
  },

  warn(msg: string): void {
    process.stderr.write(`[warn] ${msg}\n`);
  },

  error(msg: string): void {
    process.stderr.write(`[error] ${msg}\n`);
  },
};
