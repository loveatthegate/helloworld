export const MAP_BBOX = {
  west: 121.47,
  south: 31.22,
  east: 121.52,
  north: 31.25,
} as const;

export const MAP_CENTER: [number, number] = [121.495, 31.235];

/** 黄浦江上空模拟轨迹（WGS84） */
export const DRONE_PATH: [number, number][] = [
  [121.4902, 31.241],
  [121.4938, 31.2382],
  [121.4976, 31.2354],
  [121.5012, 31.2328],
  [121.497, 31.2306],
  [121.4924, 31.2324],
  [121.4896, 31.236],
];

export const OSM_RASTER_TILES = ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"];
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors (ODbL)";

export const SAT_RASTER_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
];
export const SAT_ATTRIBUTION = "Esri World Imagery · Sentinel-2 / Copernicus 本地卫星层优先";

export const LOCAL_VECTOR_PMTILES = "/maps/bund.pmtiles";
export const LOCAL_SAT_PMTILES = "/maps/bund-sat.pmtiles";

export function hasMapCoords(row: { lng?: number | null; lat?: number | null }) {
  return Number.isFinite(row.lng) && Number.isFinite(row.lat);
}

export function interpolatePath(path: [number, number][], t: number): [number, number] {
  if (path.length === 0) return MAP_CENTER;
  if (path.length === 1) return path[0];
  const clamped = ((t % 1) + 1) % 1;
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const dx = path[i + 1][0] - path[i][0];
    const dy = path[i + 1][1] - path[i][1];
    const len = Math.hypot(dx, dy);
    segs.push(len);
    total += len;
  }
  if (total === 0) return path[0];
  let remain = clamped * total;
  for (let i = 0; i < segs.length; i++) {
    if (remain <= segs[i] || i === segs.length - 1) {
      const r = segs[i] === 0 ? 0 : remain / segs[i];
      const a = path[i];
      const b = path[i + 1];
      return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r];
    }
    remain -= segs[i];
  }
  return path[path.length - 1];
}

export async function probeStaticFile(url: string) {
  try {
    const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-15" } });
    if (!res.ok) return false;
    const type = res.headers.get("content-type") || "";
    if (type.includes("text/html")) return false;
    const buf = new Uint8Array(await res.arrayBuffer());
    const magic = new TextDecoder().decode(buf.slice(0, 7));
    return magic === "PMTiles";
  } catch {
    return false;
  }
}
