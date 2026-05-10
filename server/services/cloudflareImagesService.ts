/**
 * Cloudflare Images Upload Service
 * Handles image uploads to Cloudflare Images v1 API
 * https://developers.cloudflare.com/images/cloudflare-images/api-request/
 */

export interface CloudflareUploadResult {
  success: boolean;
  imageId?: string;
  deliveryUrl?: string;
  filename?: string;
  uploaded?: string;
  error?: string;
}

export interface CloudflareUploadResponse {
  result: {
    id: string;
    filename: string;
    uploaded: string;
    requireSignedURLs: boolean;
    variants: string[];
  };
  success: boolean;
  errors: any[];
  messages: any[];
}

/**
 * Create multipart/form-data body from buffer
 * Manually constructs multipart form data without external dependencies
 */
function createFormDataBody(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  metadata?: Record<string, string>
): { body: Buffer; boundary: string } {
  const boundary = `----CloudflareImages${Date.now()}${Math.random().toString(36).substring(7)}`;
  const parts: Buffer[] = [];

  // Add file field
  const filePart = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    `Content-Type: ${mimeType}`,
    '',
  ].join('\r\n');
  parts.push(Buffer.from(filePart + '\r\n'));
  parts.push(buffer);
  parts.push(Buffer.from('\r\n'));

  // Add metadata field if provided
  if (metadata) {
    const metadataStr = JSON.stringify(metadata);
    const metadataPart = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="metadata"`,
      '',
      metadataStr,
      '',
    ].join('\r\n');
    parts.push(Buffer.from(metadataPart));
  }

  // Add closing boundary
  const closingBoundary = `--${boundary}--\r\n`;
  parts.push(Buffer.from(closingBoundary));

  const body = Buffer.concat(parts);
  return { body, boundary };
}

/**
 * Cloudflare Images Service
 * Provides functionality to upload images to Cloudflare Images
 * and generate delivery URLs for uploaded images
 */
class CloudflareImagesService {
  /**
   * Get credentials dynamically from environment variables
   * This ensures we always have the latest values even if secrets are updated at runtime
   */
  private getCredentials() {
    const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    const apiToken = (process.env.CLOUDFLARE_IMAGES_TOKEN || '').trim();
    const accountHash = (process.env.CLOUDFLARE_ACCOUNT_HASH || '').trim();
    const apiEndpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`;
    return { accountId, apiToken, accountHash, apiEndpoint };
  }

  /**
   * Check if Cloudflare Images is properly configured
   * @returns true if all required credentials are set
   */
  isCloudflareConfigured(): boolean {
    const { accountId, apiToken, accountHash } = this.getCredentials();
    const configured = !!(accountId && apiToken && accountHash);
    
    // config check log removed for bulk migration
    
    return configured;
  }

  /**
   * Upload image to Cloudflare Images
   * @param buffer - Image file buffer
   * @param filename - Original filename for reference
   * @param metadata - Optional metadata to attach to the image
   * @param mimeType - Optional explicit MIME type (preferred over filename-based detection)
   * @returns Upload result with image ID and delivery URL
   */
  async uploadToCloudflare(
    buffer: Buffer,
    filename: string,
    metadata?: Record<string, string>,
    mimeType?: string
  ): Promise<CloudflareUploadResult> {
    if (!this.isCloudflareConfigured()) {
      const error = 'Cloudflare Images service is not configured. Check environment variables.';
      console.error('[Cloudflare Images]', error);
      return {
        success: false,
        error
      };
    }

    try {
      // verbose log removed for bulk migration
      
      // Get credentials dynamically
      const { apiEndpoint, apiToken } = this.getCredentials();
      
      // Use provided MIME type or fall back to filename-based detection
      const resolvedMimeType = mimeType && mimeType.startsWith('image/') 
        ? mimeType 
        : this.getMimeType(filename);
      
      // Validate that we have a valid image MIME type
      if (!resolvedMimeType.startsWith('image/')) {
        const error = `Invalid MIME type for Cloudflare Images: ${resolvedMimeType}`;
        console.error('[Cloudflare Images]', error);
        return { success: false, error };
      }
      
      // mime type log removed for bulk migration
      
      // Create multipart form data
      const { body, boundary } = createFormDataBody(buffer, filename, resolvedMimeType, metadata);

      // Log metadata if provided
      if (metadata) {
        // metadata log removed for bulk migration
      }

      // Make API request to Cloudflare
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: body
      });

      // Handle rate limiting with exponential backoff
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
        const waitMs = Math.max(retryAfter * 1000, 10000);
        console.warn(`[Cloudflare Images] Rate limited (429). Waiting ${waitMs/1000}s before retry...`);
        await new Promise(r => setTimeout(r, waitMs));
        // Retry once after waiting
        const retryResp = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
          body: body
        });
        if (!retryResp.ok) {
          const errText = await retryResp.text();
          return { success: false, error: `rate_limited_${retryResp.status}` };
        }
        const retryData = (await retryResp.json()) as CloudflareUploadResponse;
        if (!retryData.success || !retryData.result) return { success: false, error: 'rate_limited_retry_failed' };
        const retryId = retryData.result.id;
        return { success: true, imageId: retryId, deliveryUrl: this.getCloudflareDeliveryUrl(retryId), filename: retryData.result.filename, uploaded: retryData.result.uploaded };
      }

      if (!response.ok) {
        const errorData = await response.text();
        console.error(`[Cloudflare Images] Upload failed with status ${response.status}:`, errorData);
        return {
          success: false,
          error: `Upload failed with status ${response.status}`
        };
      }

      const data = (await response.json()) as CloudflareUploadResponse;

      if (!data.success || !data.result) {
        const errorMsg = data.errors?.[0] || 'Unknown error from Cloudflare API';
        console.error('[Cloudflare Images] API returned error:', errorMsg);
        return {
          success: false,
          error: errorMsg
        };
      }

      const imageId = data.result.id;
      const deliveryUrl = this.getCloudflareDeliveryUrl(imageId);

      // Quiet log for bulk migration - only log errors

      return {
        success: true,
        imageId,
        deliveryUrl,
        filename: data.result.filename,
        uploaded: data.result.uploaded
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Cloudflare Images] Upload error:', errorMsg);
      return {
        success: false,
        error: errorMsg
      };
    }
  }

  /**
   * Generate delivery URL for a Cloudflare image
   * @param imageId - The Cloudflare image ID
   * @param variant - Image variant (default: "public")
   * @returns Complete delivery URL
   */
  getCloudflareDeliveryUrl(imageId: string, variant: string = 'public'): string {
    const { accountHash } = this.getCredentials();
    return `https://imagedelivery.net/${accountHash}/${imageId}/${variant}`;
  }

  /**
   * Determine MIME type from filename
   * @param filename - The filename to check
   * @returns MIME type string
   */
  private getMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop() || '';
    
    const mimeMap: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'bmp': 'image/bmp',
      'avif': 'image/avif',
      'tiff': 'image/tiff'
    };

    return mimeMap[ext] || 'image/jpeg';
  }
}

// Export singleton instance
export const cloudflareImagesService = new CloudflareImagesService();

// Export class for testing or extending
export { CloudflareImagesService };
