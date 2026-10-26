/** Resizes an image in the browser (no Worker CPU spent on it). Returns WebP, or JPEG where WebP encoding is missing. */
export async function resizeImage(file: File, maxSide: number, quality = 0.85): Promise<Blob> {
  return (await resizeForUpload(file, maxSide, quality)).blob;
}

/** Same, with the final size (stored with chat images so the layout doesn't jump). */
export async function resizeForUpload(
  file: File,
  maxSide: number,
  quality = 0.82,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas not available');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await encode('image/webp');
  if (webp && webp.type === 'image/webp') return { blob: webp, width, height };
  const jpeg = await encode('image/jpeg');
  if (!jpeg) throw new Error('Image encoding failed');
  return { blob: jpeg, width, height };
}
