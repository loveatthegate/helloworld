#!/usr/bin/env node
/**
 * 下载 go-pmtiles CLI，裁切外滩 bbox 矢量到 public/maps/bund.pmtiles。
 * 卫星 PMTiles（Sentinel-2）需 GDAL 另做；没有 bund-sat.pmtiles 时页面用 Esri 回退。
 */
import { spawn } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public/maps");
const CACHE = join(ROOT, ".cache");
const OUT = join(OUT_DIR, "bund.pmtiles");
const BBOX = "121.47,31.22,121.52,31.25";
const CLI_VERSION = "1.31.2";
const DEFAULT_BUILDS = [
  process.env.PROTOMAPS_URL,
  "https://build.protomaps.com/20260901.pmtiles",
  "https://build.protomaps.com/20260815.pmtiles",
  "https://build.protomaps.com/20260730.pmtiles",
  "https://build.protomaps.com/20260601.pmtiles",
].filter(Boolean);

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", cwd: ROOT });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} 退出 ${code}`))));
  });
}

function assetName() {
  const plat = process.platform;
  const arch = process.arch === "arm64" ? "arm64" : "x86_64";
  if (plat === "darwin") return `go-pmtiles-${CLI_VERSION}_Darwin_${arch === "arm64" ? "arm64" : "x86_64"}.zip`;
  if (plat === "win32") return `go-pmtiles_${CLI_VERSION}_Windows_${arch}.zip`;
  return `go-pmtiles_${CLI_VERSION}_Linux_${arch}.tar.gz`;
}

async function ensureCli() {
  const bin = join(CACHE, process.platform === "win32" ? "pmtiles.exe" : "pmtiles");
  try {
    await run(bin, ["--help"]);
    return bin;
  } catch {
    /* download */
  }
  await mkdir(CACHE, { recursive: true });
  const name = assetName();
  const url = `https://github.com/protomaps/go-pmtiles/releases/download/v${CLI_VERSION}/${name}`;
  console.log(`下载 go-pmtiles ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`下载 CLI 失败 ${res.status}`);
  const archive = join(CACHE, name);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(archive));
  if (name.endsWith(".zip")) {
    await run("unzip", ["-o", archive, "-d", CACHE]);
  } else {
    await run("tar", ["-xzf", archive, "-C", CACHE]);
  }
  await chmod(bin, 0o755);
  return bin;
}

async function resolveSource() {
  for (const url of DEFAULT_BUILDS) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok || res.status === 206) {
        console.log(`使用 ${url}`);
        return url;
      }
    } catch {
      /* next */
    }
  }
  throw new Error("找不到可用的 Protomaps 日构建，请设置 PROTOMAPS_URL");
}

await mkdir(OUT_DIR, { recursive: true });
try {
  const bin = await ensureCli();
  const source = await resolveSource();
  console.log(`裁切 ${source} → ${OUT}  bbox=${BBOX}`);
  await run(bin, ["extract", source, OUT, `--bbox=${BBOX}`, "--maxzoom=16"]);
  await writeFile(join(OUT_DIR, ".last-fetch.txt"), `${new Date().toISOString()} ${source}\n`);
  console.log("矢量 bund.pmtiles 已就绪。卫星层无本地文件时用地图页在线回退。");
} catch (error) {
  console.warn(error instanceof Error ? error.message : error);
  console.warn("地图页将使用在线 OSM / Esri 回退。");
  process.exit(1);
}
