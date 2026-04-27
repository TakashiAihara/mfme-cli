import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { launch } from "../browser.ts";
import { META_FILE } from "../paths.ts";
import { fetchCategoryMeta } from "../scraper/categories.ts";
import { log } from "../log.ts";
import { EXIT } from "../types.ts";

export async function runSyncMeta(): Promise<number> {
  const handle = await launch({ requireSession: true });
  const page = await handle.context.newPage();
  try {
    const meta = await fetchCategoryMeta(page);

    await mkdir(dirname(META_FILE), { recursive: true, mode: 0o700 });
    await writeFile(META_FILE, JSON.stringify(meta, null, 2), { mode: 0o600 });

    log.info(`saved ${meta.large.length} large / ${meta.middle.length} middle categories to ${META_FILE}`);
    return EXIT.OK;
  } catch (e) {
    log.error(e instanceof Error ? e.message : String(e));
    return EXIT.ELEMENT_NOT_FOUND;
  } finally {
    await handle.close();
  }
}
