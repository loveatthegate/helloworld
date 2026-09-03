import { analyzeVideoJob } from "./_shared/analyze-video";

export default async (req: Request) => {
  const { analysisId } = (await req.json()) as { analysisId: number };
  await analyzeVideoJob(Number(analysisId));
};
