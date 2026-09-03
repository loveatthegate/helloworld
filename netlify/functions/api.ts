import type { Config } from "@netlify/functions";
import { app } from "./_shared/app";

export default async (req: Request) => app.fetch(req);

export const config: Config = {
  path: "/api/*",
};
