// What an image is in note-scion: its URL, which types are allowed and how big one can be.
// Shared by the browser (before upload) and the server (after), so both agree.

export const IMAGE_PATH = "/api/images/";

/** Types the app stores and shows. Not SVG: a vector image can carry script. */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

/** The most one image may weigh. Vercel functions refuse bodies over 4.5 MB anyway. */
export const MAX_IMAGE_BYTES = 4_000_000;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const IMAGE_URL = new RegExp(`^${IMAGE_PATH}(${UUID})$`, "i");

export const imageUrl = (id: string) => `${IMAGE_PATH}${id}`;

/** The id in a stored image URL, or null when it isn't one. */
export function imageIdOf(src: unknown): string | null {
  return typeof src === "string" ? (IMAGE_URL.exec(src)?.[1]?.toLowerCase() ?? null) : null;
}

/** The type the first bytes of a file say it is, or null when it isn't an allowed image. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const at = (offset: number, ...values: number[]) => values.every((value, i) => bytes[offset + i] === value);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x47, 0x49, 0x46, 0x38) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return "image/gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}
