import { IMAGE_TYPES, MAX_IMAGE_BYTES, type ImageType } from "@/lib/images";

/** The longest side a stored picture keeps. Bigger ones are shrunk before they are sent. */
export const MAX_EDGE = 1600;
/** Below this a picture that already fits is sent as it is, not re-encoded. */
const KEEP_AS_IS_BYTES = 1_500_000;

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

export class ImageError extends Error {}

export const isImageFile = (file: File) => (IMAGE_TYPES as readonly string[]).includes(file.type);

/**
 * Gets a picture ready to keep: shrinks it to MAX_EDGE on its longest side (as WebP, which
 * keeps transparency) when it is larger than that or heavy, and leaves a small one, or a
 * GIF (which would lose its animation), exactly as it is. `maxBytes` is the most the
 * result may weigh.
 */
export async function prepareImage(file: File, maxBytes = MAX_IMAGE_BYTES, maxEdge = MAX_EDGE): Promise<PreparedImage> {
  if (!isImageFile(file)) throw new ImageError("Only PNG, JPEG, WebP and GIF images can be added.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError("That image couldn't be read.");
  }
  const { width, height } = bitmap;
  try {
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const fits = file.size <= Math.min(maxBytes, KEEP_AS_IS_BYTES);
    if (file.type === "image/gif") {
      // Shrinking would drop the animation, so a GIF is kept whole or refused.
      if (file.size > maxBytes) throw new ImageError("That GIF is too large.");
      return { blob: file, width, height };
    }
    if (scale === 1 && fits) return { blob: file, width, height };

    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d");
    if (!context) throw new ImageError("That image couldn't be read.");
    context.drawImage(bitmap, 0, 0, w, h);

    for (const quality of [0.85, 0.7, 0.5]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp" satisfies ImageType, quality));
      if (blob && blob.size <= maxBytes) {
        // Re-encoding made it larger and nothing was shrunk: the original was better.
        return blob.size >= file.size && scale === 1 && file.size <= maxBytes ? { blob: file, width, height } : { blob, width: w, height: h };
      }
    }
    throw new ImageError("That image is too large.");
  } finally {
    bitmap.close();
  }
}

/** What the real app does with a prepared picture: keeps it on the server and returns its URL. */
export async function uploadToServer(blob: Blob): Promise<string> {
  const response = await fetch("/api/images", { method: "POST", body: blob, headers: { "Content-Type": blob.type } });
  if (!response.ok) {
    const message = ((await response.json().catch(() => null)) as { error?: string } | null)?.error;
    throw new ImageError(message ?? "The image couldn't be saved.");
  }
  // Signed out, the middleware answers with the login page instead of JSON.
  const body = (await response.json().catch(() => null)) as { url?: string } | null;
  if (!body?.url) throw new ImageError("You've been signed out. Reload the page and sign in again.");
  return body.url;
}

/** What the in-browser demo does: the picture becomes part of the page itself, as a data URL. */
export function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new ImageError("That image couldn't be read."));
    reader.readAsDataURL(blob);
  });
}
