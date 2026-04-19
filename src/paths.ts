import { homedir } from "node:os";
import { join } from "node:path";

const xdgConfigHome = process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config");
const xdgStateHome = process.env["XDG_STATE_HOME"] ?? join(homedir(), ".local", "state");

export const CONFIG_DIR = join(xdgConfigHome, "mfme");
export const STATE_DIR = join(xdgStateHome, "mfme");

export const SESSION_FILE = join(CONFIG_DIR, "session.json");
export const META_FILE = join(CONFIG_DIR, "meta.json");
export const LOG_FILE = join(STATE_DIR, "mfme.log");
