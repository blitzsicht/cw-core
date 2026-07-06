/**
 * @cw/core/integrations/favicon-ico — ICO container builder
 *
 * Minimal, dependency-free writer for the Windows ICO container format,
 * using PNG-in-ICO entries (supported by every browser and by Windows
 * Vista+ — no BMP/DIB re-encoding needed, just wrap the PNG bytes).
 *
 * Spec reference: https://en.wikipedia.org/wiki/ICO_(file_format)
 */

export interface IcoImage {
  /** Square pixel size (width == height). 256 is encoded as 0 per spec. */
  size: number;
  /** PNG-encoded image bytes for this size. */
  png: Buffer;
}

const ICONDIR_SIZE = 6;
const ICONDIRENTRY_SIZE = 16;

/**
 * Builds a valid .ico Buffer from one or more same-format PNG images.
 * Throws if no images are given, or any size is outside the valid 1-256 range.
 */
export function buildIco(images: IcoImage[]): Buffer {
  if (images.length === 0) {
    throw new Error('buildIco: at least one image is required');
  }
  for (const img of images) {
    if (img.size < 1 || img.size > 256) {
      throw new Error(`buildIco: size must be between 1 and 256, got ${img.size}`);
    }
  }

  const headerSize = ICONDIR_SIZE + images.length * ICONDIRENTRY_SIZE;
  const header = Buffer.alloc(headerSize);

  // ICONDIR
  header.writeUInt16LE(0, 0); // reserved, must be 0
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(images.length, 4); // image count

  let offset = headerSize;
  images.forEach((img, i) => {
    const entryOffset = ICONDIR_SIZE + i * ICONDIRENTRY_SIZE;
    const dim = img.size === 256 ? 0 : img.size; // 0 == 256px per spec

    header.writeUInt8(dim, entryOffset + 0); // width
    header.writeUInt8(dim, entryOffset + 1); // height
    header.writeUInt8(0, entryOffset + 2); // color count (0 = no palette)
    header.writeUInt8(0, entryOffset + 3); // reserved, must be 0
    header.writeUInt16LE(1, entryOffset + 4); // color planes
    header.writeUInt16LE(32, entryOffset + 6); // bits per pixel (RGBA)
    header.writeUInt32LE(img.png.length, entryOffset + 8); // size of image data
    header.writeUInt32LE(offset, entryOffset + 12); // offset of image data

    offset += img.png.length;
  });

  return Buffer.concat([header, ...images.map((img) => img.png)]);
}
