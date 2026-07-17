import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImageProvider, UploadedImage } from "../provider";
import { ImageProviderError } from "../provider";

export interface LocalDiskConfig {
  /** directory to write originals into; served by a static route in dev */
  storageDir: string;
  /** base URL the storage dir is mounted at, e.g. http://localhost:9000/static-images */
  baseUrl: string;
}

/**
 * Dev/CI fallback (hardening §3 dependency-failure matrix / P0 exit
 * criterion 1: a fresh clone must be browsable in ≤15 minutes without
 * anyone's paid account existing). No transforms, no variants — same
 * file served for every variant name. Never used in production; the
 * provider is selected by IMAGE_PROVIDER env (see index.ts).
 */
export class LocalDiskImageProvider implements ImageProvider {
  constructor(private readonly config: LocalDiskConfig) {}

  async upload(buffer: Buffer, _contentType: string, filename: string): Promise<UploadedImage> {
    await mkdir(this.config.storageDir, { recursive: true });
    const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
    const id = `${randomUUID()}${ext}`;
    await writeFile(join(this.config.storageDir, id), buffer);
    return { id, url: this.variantUrl(id, "public") };
  }

  variantUrl(id: string, _variant: string): string {
    return `${this.config.baseUrl}/${id}`;
  }

  async delete(id: string): Promise<void> {
    try {
      await rm(join(this.config.storageDir, id));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new ImageProviderError(`local delete failed: ${String(err)}`);
      }
    }
  }

  /** test/dev helper: read a stored file back */
  async read(id: string): Promise<Buffer> {
    return readFile(join(this.config.storageDir, id));
  }
}
