import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processForUpload, readMetadata } from "../src/lqip";

/**
 * Build a synthetic JPEG with embedded EXIF (sharp's Exif type only
 * exposes IFD0/IFD1/ExifIFD tag groups — GPS tags are carried inside the
 * same raw EXIF blob, not a separate sharp-level field, so proving the
 * whole `exif` buffer is stripped proves GPS is gone too).
 */
async function buildImageWithExif(): Promise<Buffer> {
  return sharp({
    create: { width: 200, height: 150, channels: 3, background: { r: 120, g: 80, b: 200 } },
  })
    .jpeg()
    .withExif({
      IFD0: { Copyright: "Test Photographer 2026", Make: "eshor-test-camera" },
    })
    .toBuffer();
}

describe("Image pipeline — LQIP + EXIF stripping (NDPA posture)", () => {
  it("embeds EXIF in the test fixture (sanity check the test itself is meaningful)", async () => {
    const source = await buildImageWithExif();
    const meta = await readMetadata(source);
    expect(meta.exif).toBeDefined();
  });

  it("strips EXIF (and therefore GPS) metadata from the processed upload buffer", async () => {
    const source = await buildImageWithExif();
    const processed = await processForUpload(source);

    const outMeta = await readMetadata(processed.buffer);
    expect(outMeta.exif).toBeUndefined();
  });

  it("re-encodes to webp regardless of source format", async () => {
    const source = await buildImageWithExif(); // source is jpeg
    const processed = await processForUpload(source);
    expect(processed.contentType).toBe("image/webp");
    const outMeta = await readMetadata(processed.buffer);
    expect(outMeta.format).toBe("webp");
  });

  it("preserves visual dimensions from the source", async () => {
    const source = await buildImageWithExif();
    const processed = await processForUpload(source);
    expect(processed.width).toBe(200);
    expect(processed.height).toBe(150);
  });

  it("produces a small inline LQIP data URI", async () => {
    const source = await buildImageWithExif();
    const processed = await processForUpload(source);

    expect(processed.lqip).toMatch(/^data:image\/webp;base64,/);
    const base64 = processed.lqip.split(",")[1]!;
    const lqipBytes = Buffer.from(base64, "base64").length;
    // must be genuinely tiny — this is inlined into every PDP page's HTML
    expect(lqipBytes).toBeLessThan(2000);

    const lqipMeta = await readMetadata(Buffer.from(base64, "base64"));
    expect(lqipMeta.width).toBeLessThanOrEqual(24);
  });
});
