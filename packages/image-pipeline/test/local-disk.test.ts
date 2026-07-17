import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it } from "vitest";
import { LocalDiskImageProvider } from "../src/providers/local-disk";
import { createImageProviderFromEnv } from "../src/create-provider";
import { ImageProviderError } from "../src/provider";

const testDir = join(tmpdir(), `eshor-image-test-${randomUUID()}`);

describe("LocalDiskImageProvider (dev/CI fallback, no external account required)", () => {
  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("round-trips upload -> read -> delete", async () => {
    const provider = new LocalDiskImageProvider({
      storageDir: testDir,
      baseUrl: "http://localhost:9000/static-images",
    });

    const content = Buffer.from("fake-image-bytes");
    const uploaded = await provider.upload(content, "image/webp", "test.webp");

    expect(uploaded.url).toBe(`http://localhost:9000/static-images/${uploaded.id}`);
    expect(await provider.read(uploaded.id)).toEqual(content);

    await provider.delete(uploaded.id);
    await expect(provider.read(uploaded.id)).rejects.toThrow();
  });

  it("delete is idempotent (already-deleted id doesn't throw)", async () => {
    const provider = new LocalDiskImageProvider({
      storageDir: testDir,
      baseUrl: "http://localhost:9000/static-images",
    });
    await expect(provider.delete("never-existed.webp")).resolves.toBeUndefined();
  });
});

describe("createImageProviderFromEnv", () => {
  it("defaults to local disk when IMAGE_PROVIDER is unset (P0 exit criterion 1: no paid account required)", () => {
    const provider = createImageProviderFromEnv({});
    expect(provider).toBeInstanceOf(LocalDiskImageProvider);
  });

  it("refuses to build a Cloudflare provider without credentials, with a clear error", () => {
    expect(() => createImageProviderFromEnv({ IMAGE_PROVIDER: "cloudflare" })).toThrow(
      ImageProviderError,
    );
  });

  it("builds a Cloudflare provider when credentials are present", async () => {
    const { CloudflareImagesProvider } = await import("../src/providers/cloudflare-images");
    const provider = createImageProviderFromEnv({
      IMAGE_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: "acc",
      CLOUDFLARE_IMAGES_API_TOKEN: "token",
      CLOUDFLARE_IMAGES_DELIVERY_HASH: "hash",
    });
    expect(provider).toBeInstanceOf(CloudflareImagesProvider);
  });
});
