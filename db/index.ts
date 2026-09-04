import { mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "./schema";
import { getEnv, hasNetlifyDatabase } from "./env";

type AppDb =
  | ReturnType<typeof drizzlePglite<typeof schema>>
  | Awaited<ReturnType<typeof createNetlifyDb>>;

let cached: Promise<AppDb> | undefined;
let pglite: PGlite | undefined;

async function createNetlifyDb() {
  const { drizzle } = await import("drizzle-orm/netlify-db");
  return drizzle({ schema });
}

async function applyLocalMigrations(client: PGlite) {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, "../netlify/database/migrations");
  const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of files) {
    const sql = await readFile(join(dir, name), "utf8");
    await client.exec(sql);
  }
}

async function createLocalDb() {
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = getEnv("LVZHI_DATA_DIR") || join(process.cwd(), ".data/pglite");
  await mkdir(dataDir, { recursive: true });
  pglite = new PGlite(dataDir);
  await pglite.waitReady;
  await applyLocalMigrations(pglite);
  return drizzlePglite({ client: pglite, schema });
}

export async function getDb(): Promise<AppDb> {
  if (!cached) {
    cached = (hasNetlifyDatabase() ? createNetlifyDb() : createLocalDb()).catch((error) => {
      cached = undefined;
      throw error;
    });
  }
  return cached;
}

export { schema };
export * from "./schema";
