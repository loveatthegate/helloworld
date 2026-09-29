import { spawn } from "node:child_process";
import { isDemoRtsp, touchDemoPublisher } from "./rtsp-publisher";

function grabOnce(args: string[], timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("取流超时"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => chunks.push(chunk as Buffer));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      if (buf.length > 200) {
        resolve(buf);
        return;
      }
      reject(new Error(code === 0 ? "未拿到画面" : `ffmpeg 退出 ${code}`));
    });
  });
}

export async function captureStreamFrame(url: string): Promise<Buffer> {
  if (isDemoRtsp(url)) touchDemoPublisher();
  const isRtsp = url.startsWith("rtsp://") || url.startsWith("rtsps://");
  const inputArgs = isRtsp
    ? ["-rtsp_transport", "tcp", "-i", url]
    : ["-i", url];
  return grabOnce(
    ["-hide_banner", "-loglevel", "error", "-y", ...inputArgs, "-frames:v", "1", "-q:v", "5", "-f", "image2", "pipe:1"],
    10_000,
  );
}
