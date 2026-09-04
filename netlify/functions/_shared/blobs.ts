import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const STORE = "lvzhi";

function localPath(key: string) {
  return join(process.cwd(), ".data/blobs", key);
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  return copy;
}

async function tryNetlifyStore(consistency: "strong" | "eventual" = "eventual") {
  const { getStore } = await import("@netlify/blobs");
  return getStore({ name: STORE, consistency });
}

export async function putBlob(
  key: string,
  data: string | Uint8Array | ArrayBuffer,
  contentType: string,
): Promise<void> {
  const bytes =
    typeof data === "string"
      ? data
      : data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : data;
  try {
    const store = await tryNetlifyStore("strong");
    const payload = typeof bytes === "string" ? bytes : toArrayBuffer(bytes);
    await store.set(key, payload, { metadata: { contentType } });
    return;
  } catch {
    // Local filesystem fallback when Blobs runtime is not configured.
  }
  const full = localPath(key);
  await mkdir(dirname(full), { recursive: true });
  if (typeof bytes === "string") {
    await writeFile(full, bytes);
  } else {
    await writeFile(full, Buffer.from(bytes));
  }
  await writeFile(`${full}.meta.json`, JSON.stringify({ contentType }));
}

export async function deleteBlob(key: string): Promise<void> {
  try {
    const store = await tryNetlifyStore("strong");
    await store.delete(key);
    return;
  } catch {
    // Local filesystem fallback.
  }
  try {
    const { unlink } = await import("node:fs/promises");
    const full = localPath(key);
    await unlink(full).catch(() => undefined);
    await unlink(`${full}.meta.json`).catch(() => undefined);
  } catch {
    // ignore
  }
}

export async function getBlob(
  key: string,
): Promise<{ data: Uint8Array; contentType: string } | null> {
  try {
    const store = await tryNetlifyStore();
    const result = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!result) return null;
    const contentType =
      typeof result.metadata?.contentType === "string"
        ? result.metadata.contentType
        : "application/octet-stream";
    return { data: new Uint8Array(result.data as ArrayBuffer), contentType };
  } catch {
    // Local filesystem fallback.
  }
  try {
    const full = localPath(key);
    const data = await readFile(full);
    let contentType = "application/octet-stream";
    try {
      const meta = JSON.parse(await readFile(`${full}.meta.json`, "utf8")) as {
        contentType?: string;
      };
      if (meta.contentType) contentType = meta.contentType;
    } catch {
      // no metadata
    }
    return { data, contentType };
  } catch {
    return null;
  }
}
