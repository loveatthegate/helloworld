export type ExtractedFrame = {
  index: number;
  timestampSec: number;
  mimeType: string;
  dataBase64: string;
};

function wait(video: HTMLVideoElement, event: string) {
  return new Promise<void>((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("视频无法解码，请换 MP4 / WebM"));
    };
    const cleanup = () => {
      video.removeEventListener(event, onOk);
      video.removeEventListener("error", onErr);
    };
    video.addEventListener(event, onOk, { once: true });
    video.addEventListener("error", onErr, { once: true });
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.replace(/^data:[^;]+;base64,/, ""));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function extractFrames(
  file: File,
  intervalSec: number,
  maxFrames: number,
  onProgress?: (done: number, total: number, duration: number) => void,
): Promise<{ frames: ExtractedFrame[]; duration: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await wait(video, "loadedmetadata");
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration || duration <= 0) throw new Error("无法读取视频时长");

    const times: number[] = [];
    for (let t = 0; t < duration && times.length < maxFrames; t += intervalSec) {
      times.push(Math.min(t, Math.max(0, duration - 0.05)));
    }
    if (times.length === 0) times.push(0);
    const last = Math.max(0, duration - 0.05);
    if (times[times.length - 1]! < last - intervalSec / 2 && times.length < maxFrames) {
      times.push(last);
    }

    const maxW = 640;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("当前浏览器不支持画布抽帧");

    const frames: ExtractedFrame[] = [];
    for (let i = 0; i < times.length; i++) {
      const t = times[i]!;
      video.currentTime = t;
      await wait(video, "seeked");
      const scale = Math.min(1, maxW / (video.videoWidth || maxW));
      canvas.width = Math.max(1, Math.round((video.videoWidth || maxW) * scale));
      canvas.height = Math.max(1, Math.round((video.videoHeight || 360) * scale));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
      if (!blob) continue;
      frames.push({
        index: i,
        timestampSec: t,
        mimeType: "image/jpeg",
        dataBase64: await blobToBase64(blob),
      });
      onProgress?.(i + 1, times.length, duration);
    }
    return { frames, duration };
  } finally {
    URL.revokeObjectURL(url);
    video.src = "";
  }
}
