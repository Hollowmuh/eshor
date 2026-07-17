import sharp from "sharp";

/**
 * Publish-time processing (Layer 3 §1.4 / P0 day 6-7 plan): every
 * uploaded image gets re-encoded through sharp before it ever reaches a
 * provider. Two things happen unconditionally, not optionally:
 *
 * 1. EXIF/GPS metadata is stripped (NDPA posture, hardening §1.3 —
 *    review/product photos must not leak a photographer's GPS location).
 *    sharp strips all metadata by default UNLESS you call
 *    .withMetadata() — we deliberately never call it.
 * 2. A tiny LQIP (low-quality image placeholder) is generated as an
 *    inline base64 data URI so the storefront never renders a blank box
 *    while the real image loads (EC2.4-adjacent: layout never breaks).
 */
export interface ProcessedImage {
  /** re-encoded, EXIF-stripped buffer ready for upload */
  buffer: Buffer;
  contentType: string;
  /** small inline placeholder, e.g. "data:image/webp;base64,..." */
  lqip: string;
  width: number;
  height: number;
}

const LQIP_WIDTH = 24;

export async function processForUpload(input: Buffer): Promise<ProcessedImage> {
  const image = sharp(input).rotate(); // auto-orient from EXIF, then metadata is dropped
  const metadata = await image.metadata();

  const buffer = await image.webp({ quality: 82 }).toBuffer();

  const lqipBuffer = await sharp(input)
    .rotate()
    .resize({ width: LQIP_WIDTH })
    .webp({ quality: 30 })
    .toBuffer();

  return {
    buffer,
    contentType: "image/webp",
    lqip: `data:image/webp;base64,${lqipBuffer.toString("base64")}`,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
  };
}

/** Read back whatever metadata survived processing — used by tests to prove stripping. */
export async function readMetadata(buffer: Buffer): Promise<sharp.Metadata> {
  return sharp(buffer).metadata();
}
