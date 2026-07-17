/**
 * Image provider abstraction (Layer 4 D3: Cloudflare Images; hardening
 * §4 dependency-failure matrix treats image serving as swappable). Every
 * upload flows through this interface regardless of which backend is
 * configured, so switching providers later never touches call sites.
 */
export interface UploadedImage {
  /** provider-specific identifier (Cloudflare image id, or local file id) */
  id: string;
  /** canonical delivery URL at the provider's default variant */
  url: string;
}

export interface ImageProvider {
  upload(buffer: Buffer, contentType: string, filename: string): Promise<UploadedImage>;
  /** delivery URL for a specific named variant (e.g. "thumbnail", "public") */
  variantUrl(id: string, variant: string): string;
  delete(id: string): Promise<void>;
}

export class ImageProviderError extends Error {}
