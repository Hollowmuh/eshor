import { CloudflareImagesProvider } from "./providers/cloudflare-images";
import { LocalDiskImageProvider } from "./providers/local-disk";
import type { ImageProvider } from "./provider";
import { ImageProviderError } from "./provider";

/**
 * Provider selection from environment (hardening §3 dependency matrix):
 * IMAGE_PROVIDER=cloudflare requires real Cloudflare credentials and is
 * the production choice (Layer 4 D3). Anything else — including unset,
 * which is the default for a fresh dev clone — uses local disk so the
 * store is browsable without anyone's paid account (P0 exit criterion 1).
 */
export function createImageProviderFromEnv(env: NodeJS.ProcessEnv = process.env): ImageProvider {
  const kind = env.IMAGE_PROVIDER ?? "local";

  if (kind === "cloudflare") {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = env.CLOUDFLARE_IMAGES_API_TOKEN;
    const deliveryHash = env.CLOUDFLARE_IMAGES_DELIVERY_HASH;
    if (!accountId || !apiToken || !deliveryHash) {
      throw new ImageProviderError(
        "IMAGE_PROVIDER=cloudflare requires CLOUDFLARE_ACCOUNT_ID, " +
          "CLOUDFLARE_IMAGES_API_TOKEN, and CLOUDFLARE_IMAGES_DELIVERY_HASH",
      );
    }
    return new CloudflareImagesProvider({ accountId, apiToken, deliveryHash });
  }

  return new LocalDiskImageProvider({
    storageDir: env.LOCAL_IMAGE_STORAGE_DIR ?? "/tmp/eshor-images",
    baseUrl: env.LOCAL_IMAGE_BASE_URL ?? "http://localhost:9000/static-images",
  });
}
