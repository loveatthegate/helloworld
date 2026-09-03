import { getDb, schema } from "../../../db/index";

export async function getSettingsRow() {
  const db = await getDb();
  const [row] = await db.select().from(schema.appSettings).limit(1);
  if (row) return row;
  const [created] = await db
    .insert(schema.appSettings)
    .values({
      defaultModel: "gemini-2.5-flash",
      provider: "gemini",
      modelName: "gemini-2.5-flash",
      frameIntervalSec: 5,
      maxFrames: 30,
    })
    .returning();
  return created;
}

export function maskKey(value?: string | null) {
  if (!value) return "";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export const ALLOWED_INTERVALS = [3, 5, 10] as const;

export function normalizeInterval(value?: number | null) {
  const n = Number(value);
  return (ALLOWED_INTERVALS as readonly number[]).includes(n) ? n : 5;
}
