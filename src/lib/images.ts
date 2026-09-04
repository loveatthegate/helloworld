export async function fileToJpegBase64(file: File, maxW = 512): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("图片无法读取"));
      el.src = url;
    });
    const scale = Math.min(1, maxW / (img.naturalWidth || maxW));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((img.naturalWidth || maxW) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || 360) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("当前浏览器不支持画布");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.62);
    return data.replace(/^data:[^;]+;base64,/, "");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadVideoChunks(analysisId: number, file: File, onProgress?: (label: string) => void) {
  const chunkSize = 4 * 1024 * 1024;
  const total = Math.max(1, Math.ceil(file.size / chunkSize));
  for (let i = 0; i < total; i++) {
    const blob = file.slice(i * chunkSize, (i + 1) * chunkSize);
    const form = new FormData();
    form.set("file", blob, `${file.name}.part${i}`);
    form.set("index", String(i));
    form.set("total", String(total));
    form.set("contentType", file.type || "video/mp4");
    onProgress?.(`上传原视频 ${i + 1}/${total}`);
    const res = await fetch(`/api/analyses/${analysisId}/video-chunk`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
      throw new Error(err.error || "视频上传失败");
    }
  }
}
