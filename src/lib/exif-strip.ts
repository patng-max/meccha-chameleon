import ExifReader from "exifreader";
import sharp from "sharp";

export async function stripImageExif(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const input = Buffer.from(buffer);

  try {
    ExifReader.load(input);
  } catch {
    // Unsupported or metadata-free images can still be safely re-encoded.
  }

  const metadata = await sharp(input).metadata();
  const pipeline = sharp(input).rotate();
  const output =
    metadata.format === "png"
      ? await pipeline.png().toBuffer()
      : await pipeline.jpeg({ mozjpeg: true }).toBuffer();

  return output.buffer.slice(
    output.byteOffset,
    output.byteOffset + output.byteLength,
  ) as ArrayBuffer;
}
