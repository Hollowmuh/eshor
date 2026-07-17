import type { ImageProvider, UploadedImage } from "../provider";
import { ImageProviderError } from "../provider";

export interface CloudflareImagesConfig {
  accountId: string;
  apiToken: string;
  /** the delivery hash Cloudflare assigns your account — needed to build variant URLs */
  deliveryHash: string;
}

/**
 * Real Cloudflare Images implementation (Layer 4 D3 decision, ~$5-6/mo at
 * eshor's launch scale — zero egress fees, no imgproxy service to run).
 * Requires CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_IMAGES_API_TOKEN /
 * CLOUDFLARE_IMAGES_DELIVERY_HASH — an external account only Abdul can
 * provision. Wired and ready; falls back to LocalDiskImageProvider
 * (see local-disk.ts) whenever those env vars are absent, which is what
 * makes P0's "browsable in 15 minutes from fresh clone" exit criterion
 * possible without requiring anyone's paid account.
 */
export class CloudflareImagesProvider implements ImageProvider {
  constructor(private readonly config: CloudflareImagesConfig) {}

  async upload(buffer: Buffer, contentType: string, filename: string): Promise<UploadedImage> {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: contentType }), filename);

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/images/v1`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.apiToken}` },
        body: form,
      },
    );

    if (!res.ok) {
      throw new ImageProviderError(
        `Cloudflare Images upload failed: ${res.status} ${await res.text()}`,
      );
    }

    const json = (await res.json()) as { result: { id: string } };
    return { id: json.result.id, url: this.variantUrl(json.result.id, "public") };
  }

  variantUrl(id: string, variant: string): string {
    return `https://imagedelivery.net/${this.config.deliveryHash}/${id}/${variant}`;
  }

  async delete(id: string): Promise<void> {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/images/v1/${id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${this.config.apiToken}` } },
    );
    if (!res.ok) {
      throw new ImageProviderError(`Cloudflare Images delete failed: ${res.status}`);
    }
  }
}
