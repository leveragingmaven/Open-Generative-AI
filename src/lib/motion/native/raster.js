/**
 * Native renderer — rasterizer.
 *
 * `sharp` is already a Creator OS runtime dependency (it stores video posters), and
 * its bundled libvips ships librsvg with FreeType, HarfBuzz and Pango — so an SVG
 * frame rasterises with real text shaping and no system fonts. That is what makes a
 * browser-grade renderer possible inside the existing Node deployment without
 * adding Chromium.
 *
 * Node-only module.
 */

import sharp from 'sharp';

export class RasterError extends Error {
  constructor(message, { code = 'raster_failed', cause = null } = {}) {
    super(message);
    this.name = 'RasterError';
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Creates a rasterizer bound to one canvas size.
 *
 * `frameRaw` returns RGBA bytes ready to pipe straight into FFmpeg, so a video
 * render never pays for PNG or JPEG encoding.
 */
export function createRasterizer({ width, height, sharpImpl = sharp, density = 72 } = {}) {
  function assertSize(info) {
    if (info.width !== width || info.height !== height) {
      throw new RasterError(
        `Rasterised frame was ${info.width}x${info.height}, expected ${width}x${height}.`,
        { code: 'raster_size_mismatch' },
      );
    }
  }

  return {
    width,
    height,
    /** Raw RGBA bytes (4 channels) — the video path. */
    async frameRaw(svg) {
      try {
        const { data, info } = await sharpImpl(Buffer.from(svg), { density })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        assertSize(info);
        return data;
      } catch (error) {
        if (error instanceof RasterError) throw error;
        throw new RasterError(`Could not rasterise a frame: ${error.message}`, { cause: error });
      }
    },
    /** PNG bytes — thumbnails, cover images and the contact sheet. */
    async framePng(svg, { compressionLevel = 6 } = {}) {
      try {
        const { data, info } = await sharpImpl(Buffer.from(svg), { density })
          .png({ compressionLevel })
          .toBuffer({ resolveWithObject: true });
        assertSize(info);
        return data;
      } catch (error) {
        if (error instanceof RasterError) throw error;
        throw new RasterError(`Could not rasterise a PNG: ${error.message}`, { cause: error });
      }
    },
    /** JPEG bytes — used by the still-deck PDF, where PNG would be far larger. */
    async frameJpeg(svg, { quality = 86 } = {}) {
      const data = await sharpImpl(Buffer.from(svg), { density }).jpeg({ quality, mozjpeg: true }).toBuffer();
      return data;
    },
  };
}

/** Loads an image from bytes and returns the data URI a slide can embed. */
export async function imageDataUri(bytes, { mime = 'image/png' } = {}) {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

/** Downsizes any image bytes to a data URI a slide can embed without bloat. */
export async function imageDataUriFromFile(bytes, { maxWidth = 1080, quality = 88 } = {}) {
  const resized = await sharp(bytes)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .png({ compressionLevel: 8 })
    .toBuffer();
  return imageDataUri(resized);
}

export { sharp };
