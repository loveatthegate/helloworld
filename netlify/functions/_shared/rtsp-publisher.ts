import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { getEnv } from "../../../db/env";

const IDLE_MS = 20_000;
let child: ChildProcess | null = null;
let lastTouch = 0;
let idleTimer: ReturnType<typeof setInterval> | null = null;

export function demoRtspUrl() {
  return getEnv("DEMO_RTSP_URL") || "rtsp://mediamtx:8554/demo";
}

export function isDemoRtsp(url?: string | null) {
  if (!url) return false;
  const demo = demoRtspUrl();
  return url === demo || url.includes(":8554/demo") || url.endsWith("/demo");
}

function demoFile() {
  if (existsSync("/app/public/samples/demo.mp4")) return "/app/public/samples/demo.mp4";
  if (existsSync("public/samples/demo.mp4")) return "public/samples/demo.mp4";
  return null;
}

function start() {
  const file = demoFile();
  const dest = demoRtspUrl();
  if (!file) {
    console.warn("演示视频不存在，跳过按需推流");
    return;
  }
  if (child && child.exitCode === null) return;
  child = spawn(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-re",
      "-stream_loop",
      "-1",
      "-i",
      file,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-tune",
      "zerolatency",
      "-pix_fmt",
      "yuv420p",
      "-an",
      "-f",
      "rtsp",
      "-rtsp_transport",
      "tcp",
      dest,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  child.stderr?.on("data", () => undefined);
  child.on("exit", () => {
    child = null;
  });
  console.info("演示 RTSP 已按需启动");
}

function armIdle() {
  if (idleTimer) return;
  idleTimer = setInterval(() => {
    if (!child) return;
    if (Date.now() - lastTouch <= IDLE_MS) return;
    stopDemoPublisher();
  }, 5000);
}

export function touchDemoPublisher() {
  lastTouch = Date.now();
  start();
  armIdle();
}

export function stopDemoPublisher() {
  if (!child) return;
  const proc = child;
  child = null;
  proc.kill("SIGTERM");
  setTimeout(() => {
    if (proc.exitCode === null) proc.kill("SIGKILL");
  }, 1500);
  console.info("演示 RTSP 已空闲停止");
}

export function demoPublisherActive() {
  return Boolean(child && child.exitCode === null);
}
