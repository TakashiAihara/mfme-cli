import { mkdir, writeFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { SESSION_FILE } from "./paths.ts";

export async function saveSession(storageState: unknown): Promise<void> {
  await mkdir(dirname(SESSION_FILE), { recursive: true, mode: 0o700 });
  await writeFile(SESSION_FILE, JSON.stringify(storageState, null, 2), { mode: 0o600 });
}

export async function loadSession(): Promise<string | null> {
  try {
    await stat(SESSION_FILE);
  } catch {
    return null;
  }

  return SESSION_FILE;
}

export async function hasSession(): Promise<boolean> {
  return (await loadSession()) !== null;
}
