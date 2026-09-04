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

export const DEFAULT_BRANDING = {
  systemName: "履职系统",
  tagline: "SOP 视觉核验",
  companyName: "",
  copyright: "© 履职系统",
  themeColor: "#0f766e",
};

export function publicBranding(row: Awaited<ReturnType<typeof getSettingsRow>>) {
  return {
    systemName: row.systemName || DEFAULT_BRANDING.systemName,
    tagline: row.tagline || DEFAULT_BRANDING.tagline,
    companyName: row.companyName || "",
    copyright: row.copyright || DEFAULT_BRANDING.copyright,
    themeColor: row.themeColor || DEFAULT_BRANDING.themeColor,
    logoUrl: row.logoBlobKey ? "/api/branding/logo" : null,
    loginImageUrl: row.loginImageBlobKey ? "/api/branding/login-image" : null,
  };
}

export const ALLOWED_INTERVALS = [3, 5, 10] as const;

export function normalizeInterval(value?: number | null) {
  const n = Number(value);
  return (ALLOWED_INTERVALS as readonly number[]).includes(n) ? n : 5;
}
