import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { listCameras, type Camera } from "../lib/api";
import { CameraPreviewModal } from "../components/CameraPreviewModal";
import {
  DRONE_PATH,
  LOCAL_SAT_PMTILES,
  LOCAL_VECTOR_PMTILES,
  MAP_BBOX,
  MAP_CENTER,
  OSM_ATTRIBUTION,
  OSM_RASTER_TILES,
  SAT_ATTRIBUTION,
  SAT_RASTER_TILES,
  hasMapCoords,
  interpolatePath,
  probeStaticFile,
} from "../lib/map-demo";

let pmtilesReady = false;
function ensurePmtilesProtocol() {
  if (pmtilesReady) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  pmtilesReady = true;
}

function vectorLayers(): maplibregl.LayerSpecification[] {
  return [
    { id: "bg", type: "background", paint: { "background-color": "#e8e4dc" } },
    { id: "earth", type: "fill", source: "bund", "source-layer": "earth", paint: { "fill-color": "#e8e4dc" } },
    { id: "landuse", type: "fill", source: "bund", "source-layer": "landuse", paint: { "fill-color": "#d5e0c8", "fill-opacity": 0.45 } },
    { id: "water", type: "fill", source: "bund", "source-layer": "water", paint: { "fill-color": "#8ebdd8" } },
    { id: "buildings", type: "fill", source: "bund", "source-layer": "buildings", paint: { "fill-color": "#c9c4bb" } },
    { id: "roads", type: "line", source: "bund", "source-layer": "roads", paint: { "line-color": "#fff", "line-width": 1.35 } },
  ];
}

function pmtilesUrl(path: string) {
  return `pmtiles://${window.location.origin}${path}`;
}

function buildStyle(localVector: boolean, localSat: boolean): maplibregl.StyleSpecification {
  const sources: maplibregl.StyleSpecification["sources"] = {};
  const layers: maplibregl.LayerSpecification[] = [];

  if (localVector) {
    sources.bund = {
      type: "vector",
      url: pmtilesUrl(LOCAL_VECTOR_PMTILES),
      attribution: OSM_ATTRIBUTION,
    };
    layers.push(...vectorLayers());
  } else {
    sources.osm = {
      type: "raster",
      tiles: OSM_RASTER_TILES,
      tileSize: 256,
      attribution: OSM_ATTRIBUTION,
    };
    layers.push({ id: "osm", type: "raster", source: "osm" });
  }

  if (localSat) {
    sources.sat = {
      type: "raster",
      url: pmtilesUrl(LOCAL_SAT_PMTILES),
      tileSize: 256,
      attribution: "Sentinel-2 · Copernicus",
    };
  } else {
    sources.sat = {
      type: "raster",
      tiles: SAT_RASTER_TILES,
      tileSize: 256,
      attribution: SAT_ATTRIBUTION,
    };
  }
  layers.push({ id: "sat", type: "raster", source: "sat", layout: { visibility: "none" } });

  return { version: 8, sources, layers };
}

function markerEl(kind: "camera" | "drone") {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "lvzhi-map-marker";
  el.style.cssText = [
    "width:18px",
    "height:18px",
    "border-radius:9999px",
    "border:2px solid #fff",
    "box-shadow:0 1px 4px rgba(15,23,42,.35)",
    "cursor:pointer",
    "pointer-events:auto",
    "z-index:2",
    `background:${kind === "drone" ? "#d97706" : "#0f766e"}`,
  ].join(";");
  el.title = kind === "drone" ? "无人机" : "固定点位";
  return el;
}

export function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const droneMarkerRef = useRef<Marker | null>(null);
  const camerasRef = useRef<Camera[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [basemap, setBasemap] = useState<"vector" | "satellite">("vector");
  const [preview, setPreview] = useState<Camera | null>(null);
  const [tileNote, setTileNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCameras()
      .then((rows) => {
        setCameras(rows);
        camerasRef.current = rows;
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    camerasRef.current = cameras;
  }, [cameras]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const satOn = basemap === "satellite";
    if (map.getLayer("sat")) {
      map.setLayoutProperty("sat", "visibility", satOn ? "visible" : "none");
    }
    const hasLocalVector = Boolean(map.getSource("bund"));
    for (const id of ["bg", "earth", "landuse", "water", "buildings", "roads"]) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", satOn ? "none" : "visible");
      }
    }
    if (map.getLayer("osm")) {
      map.setLayoutProperty("osm", "visibility", satOn || hasLocalVector ? "none" : "visible");
    }
  }, [basemap]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    let raf = 0;
    let started = 0;

    const start = async () => {
      ensurePmtilesProtocol();
      const [localVector, localSat] = await Promise.all([
        probeStaticFile(LOCAL_VECTOR_PMTILES),
        probeStaticFile(LOCAL_SAT_PMTILES),
      ]);
      if (cancelled) return;
      setTileNote(
        localVector && localSat
          ? "本地矢量 + 卫星 PMTiles"
          : localVector
            ? "本地矢量 PMTiles · 卫星为在线回退"
            : localSat
              ? "本地卫星 PMTiles · 矢量为 OSM 在线回退"
              : "未找到本地 PMTiles，使用 OSM / Esri 在线底图",
      );

      const map = new maplibregl.Map({
        container: el,
        style: buildStyle(false, localSat),
        center: MAP_CENTER,
        zoom: 14.2,
        minZoom: 12,
        maxZoom: 18,
        maxBounds: [
          [MAP_BBOX.west - 0.01, MAP_BBOX.south - 0.01],
          [MAP_BBOX.east + 0.01, MAP_BBOX.north + 0.01],
        ],
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      mapRef.current = map;
      el.addEventListener("click", (ev) => {
        const target = (ev.target as HTMLElement | null)?.closest?.("[data-camera-id]") as HTMLElement | null;
        if (!target) return;
        ev.stopPropagation();
        const id = target.dataset.cameraId;
        const cam =
          camerasRef.current.find((row) => String(row.id) === id) ||
          camerasRef.current.find((row) => row.deviceKind === "drone");
        if (cam) setPreview(cam);
      });
      function onReady() {
        if (cancelled || !map.getStyle() || map.getSource("drone-path")) return;
        if (localVector) {
          try {
            map.addSource("bund", {
              type: "vector",
              url: pmtilesUrl(LOCAL_VECTOR_PMTILES),
              attribution: OSM_ATTRIBUTION,
            });
            for (const layer of vectorLayers()) {
              map.addLayer(layer, "osm");
            }
            map.setLayoutProperty("osm", "visibility", "none");
          } catch {
            setTileNote("本地矢量加载失败，使用 OSM 栅格 · 卫星为在线回退");
          }
        }
        map.addSource("drone-path", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: DRONE_PATH },
          },
        });
        map.addLayer({
          id: "drone-path",
          type: "line",
          source: "drone-path",
          paint: { "line-color": "#d97706", "line-width": 2, "line-opacity": 0.7, "line-dasharray": [2, 1] },
        });

        const paintMarkers = () => {
          for (const marker of markersRef.current) marker.remove();
          markersRef.current = [];
          const rows = camerasRef.current.filter((cam) => hasMapCoords(cam) && cam.deviceKind !== "drone");
          for (const cam of rows) {
            const node = markerEl("camera");
            node.dataset.cameraId = String(cam.id);
            const marker = new maplibregl.Marker({ element: node, anchor: "center" })
              .setLngLat([cam.lng as number, cam.lat as number])
              .addTo(map);
            markersRef.current.push(marker);
          }
        };
        paintMarkers();

        const droneCam = camerasRef.current.find((cam) => cam.deviceKind === "drone") ?? null;
        const droneEl = markerEl("drone");
        droneEl.dataset.cameraId = droneCam ? String(droneCam.id) : "drone";
        const droneMarker = new maplibregl.Marker({ element: droneEl, anchor: "center" }).setLngLat(DRONE_PATH[0]).addTo(map);
        droneMarkerRef.current = droneMarker;

        const tick = (now: number) => {
          if (!started) started = now;
          const t = ((now - started) / 28000) % 1;
          droneMarker.setLngLat(interpolatePath(DRONE_PATH, t));
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }
      const kick = () => {
        try {
          onReady();
        } catch (err) {
          setError(err instanceof Error ? err.message : "地图标注失败");
        }
      };
      map.on("style.load", kick);
      map.on("load", kick);
      setTimeout(kick, 0);
      setTimeout(kick, 1200);
    };

    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      droneMarkerRef.current?.remove();
      droneMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.loaded()) return;
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];
    for (const cam of cameras.filter((row) => hasMapCoords(row) && row.deviceKind !== "drone")) {
      const node = markerEl("camera");
      node.dataset.cameraId = String(cam.id);
      const marker = new maplibregl.Marker({ element: node, anchor: "center" })
        .setLngLat([cam.lng as number, cam.lat as number])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [cameras]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={containerRef} className="min-h-[520px] flex-1" />
      <div className="pointer-events-none absolute inset-x-4 top-4 flex flex-wrap items-start justify-between gap-3">
        <div className="pointer-events-auto rounded-xl bg-white/95 px-3 py-2 text-xs text-slate-600 shadow ring-1 ring-slate-200">
          <div className="font-medium text-ink">外滩 Demo · WGS84</div>
          <div className="mt-0.5">{tileNote || "加载底图…"}</div>
          {error && <div className="mt-1 text-rose-600">{error}</div>}
        </div>
        <div className="pointer-events-auto flex rounded-lg bg-white/95 p-1 shadow ring-1 ring-slate-200">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${basemap === "vector" ? "bg-teal text-white" : "text-slate-600"}`}
            onClick={() => setBasemap("vector")}
          >
            矢量
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${basemap === "satellite" ? "bg-teal text-white" : "text-slate-600"}`}
            onClick={() => setBasemap("satellite")}
          >
            卫星
          </button>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-6 left-4 rounded-xl bg-white/95 px-3 py-2 text-xs text-slate-600 shadow ring-1 ring-slate-200">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-teal" /> 固定点
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-600" /> 无人机（模拟轨迹）
        </div>
      </div>
      {preview && <CameraPreviewModal camera={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
