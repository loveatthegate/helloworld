export function getEnv(name: string): string | undefined {
  try {
    const netlify = (globalThis as { Netlify?: { env?: { get?: (key: string) => string | undefined } } })
      .Netlify;
    const fromNetlify = netlify?.env?.get?.(name);
    if (fromNetlify) return fromNetlify;
  } catch {
    // Local Vite / Node has no Netlify runtime.
  }
  return process.env[name];
}

export function hasNetlifyDatabase(): boolean {
  return Boolean(getEnv("NETLIFY_DB_URL"));
}

export function isNetlifyRuntime(): boolean {
  return Boolean(getEnv("NETLIFY")) && !getEnv("LVZHI_VITE_API");
}
