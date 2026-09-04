import { analyzeVideoJob } from "./_shared/analyze-video";
import { getDb, schema } from "../../db/index";
import { eq } from "drizzle-orm";

export default async (req: Request) => {
  const { analysisId } = (await req.json()) as { analysisId: number };
  const id = Number(analysisId);
  try {
    await analyzeVideoJob(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const db = await getDb();
      await db
        .update(schema.analyses)
        .set({
          status: "failed",
          errorMessage: message,
          progressMessage: message,
          progressUpdatedAt: new Date(),
          completedAt: new Date(),
        })
        .where(eq(schema.analyses.id, id));
    } catch {
      console.error("analyze-video-background failed", error);
    }
  }
};
