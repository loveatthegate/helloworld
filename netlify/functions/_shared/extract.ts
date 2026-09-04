import mammoth from "mammoth";
import { extractText } from "unpdf";
import type { ImagePart } from "./models";

export type ExtractedSop = {
  text: string;
  images: ImagePart[];
};

function isImage(contentType: string, filename: string) {
  return contentType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(filename);
}

export async function extractSopContent(
  bytes: Uint8Array,
  contentType: string,
  filename: string,
): Promise<ExtractedSop> {
  const name = filename.toLowerCase();
  if (isImage(contentType, filename)) {
    const mimeType = contentType.startsWith("image/") ? contentType : "image/jpeg";
    return {
      text: `用户上传了 SOP 图片：${filename}。请从图像中识别手册步骤。`,
      images: [{ mimeType, base64: Buffer.from(bytes).toString("base64") }],
    };
  }
  if (name.endsWith(".pdf") || contentType === "application/pdf") {
    const { text } = await extractText(bytes, { mergePages: true });
    const joined = String(text || "").trim();
    return { text: joined, images: [] };
  }
  if (name.endsWith(".docx") || contentType.includes("wordprocessingml")) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return { text: result.value.trim(), images: [] };
  }
  return { text: new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim(), images: [] };
}
