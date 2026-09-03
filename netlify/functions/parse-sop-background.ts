import { parseSopJob } from "./_shared/parse-sop";

export default async (req: Request) => {
  const { sopId } = (await req.json()) as { sopId: number };
  await parseSopJob(Number(sopId));
};
