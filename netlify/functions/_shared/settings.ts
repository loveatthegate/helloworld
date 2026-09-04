import { getDb, schema } from "../../../db/index";

export async function getSettingsRow() {
  const db = await getDb();
  const [row] = await db.select().from(schema.appSettings).limit(1);
  if (row) return row;
  const [created] = await db
    .insert(schema.appSettings)
    .values({
      defaultModel: "gpt-5.6-terra",
      provider: "custom",
      modelName: "gpt-5.6-terra",
      frameIntervalSec: 5,
      maxFrames: 30,
    })
    .returning();
  return created;
}

export const ALLOWED_INTERVALS = [3, 5, 10] as const;

export function normalizeInterval(value?: number | null) {
  const n = Number(value);
  return (ALLOWED_INTERVALS as readonly number[]).includes(n) ? n : 5;
}
