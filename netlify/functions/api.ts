import type { Config } from "@netlify/functions";
import { app } from "./_shared/app";

export default async (req: Request) => {
  const url = new URL(req.url);
  if (url.pathname.startsWith("/.netlify/functions/api")) {
    const rest = url.pathname.slice("/.netlify/functions/api".length);
    url.pathname = `/api${rest || ""}`;
    return app.fetch(new Request(url.toString(), req));
  }
  return app.fetch(req);
};

export const config: Config = {
  path: ["/api/*", "/.netlify/functions/api", "/.netlify/functions/api/*"],
};
