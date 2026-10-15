const MAX_BROWSER_TRANSCODE_PIXELS = 32_000_000;

/** News display images: reduce transport cost before multipart upload. */
export async function prepareNewsImage(file: File): Promise<File> {
  if (file.size <= 512 * 1024 || !/^image\/(jpeg|jpg|png|heic|heif)$/i.test(file.type)) return file;
  let decoded: Awaited<ReturnType<typeof decodeImageInBrowser>> | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    decoded = await decodeImageInBrowser(file);
    if (!decoded.width || !decoded.height) return file;
    const scale = Math.min(1, 2560 / Math.max(decoded.width, decoded.height));
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    let blob = await canvasToBlob(canvas, "image/webp", 0.9);
    if (!blob || blob.type !== "image/webp") {
      // PNG fallback preserves transparency on browsers without WebP encoding.
      const type = /image\/jpe?g/i.test(file.type) ? "image/jpeg" : "image/png";
      blob = await new Promise<Blob | null>(resolve => canvas!.toBlob(resolve, type, 0.9));
    }
    // Never increase the payload or replace the original for a trivial saving.
    if (!blob || !blob.size || blob.size >= file.size * 0.9) return file;
    const extension = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${extension}`, {
      type: blob.type, lastModified: file.lastModified,
    });
  } catch {
    // Server decoding remains available (e.g. HEIC on an older browser).
    return file;
  } finally {
    decoded?.cleanup();
    if (canvas) canvas.width = canvas.height = 0;
  }
}

export function isAvifFile(file: File): boolean {
  return file.type.toLowerCase() === "image/avif" || /\.avif$/i.test(file.name);
}

async function decodeImageInBrowser(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  } catch {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.decoding = "async";
    image.src = objectUrl;
    try {
      await image.decode();
      return {
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        cleanup: () => URL.revokeObjectURL(objectUrl),
      };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: "image/webp" | "image/jpeg",
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
}

/**
 * Independent AVIF fallback for files the server's libvips build cannot decode.
 * Modern Safari/Chrome can often decode those files, so retry as WebP without
 * asking the editor to convert the image manually.
 */
export async function transcodeAvifInBrowser(file: File): Promise<File> {
  const decoded = await decodeImageInBrowser(file);
  try {
    if (!decoded.width || !decoded.height) {
      throw new Error("AVIF has invalid dimensions");
    }

    const scale = Math.min(
      1,
      Math.sqrt(MAX_BROWSER_TRANSCODE_PIXELS / (decoded.width * decoded.height)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");

    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    let blob = await canvasToBlob(canvas, "image/webp", 0.9);
    let extension = "webp";

    if (!blob || blob.type !== "image/webp") {
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.globalCompositeOperation = "source-over";
      blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
      extension = "jpg";
    }

    if (!blob) throw new Error("Browser image encoding failed");
    const fileName = file.name.replace(/\.avif$/i, `.${extension}`);
    return new File([blob], fileName === file.name ? `${file.name}.${extension}` : fileName, {
      type: blob.type,
      lastModified: file.lastModified,
    });
  } finally {
    decoded.cleanup();
  }
}
