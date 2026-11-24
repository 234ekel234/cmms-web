/**
 * Photos on a problem report — the sticker form (`app/r/[code]`) and the
 * signed-in Report a problem (`components/ReportProblemModal.tsx`).
 *
 * Mirrors MAX_PHOTOS_PER_SEND and isReportPhotoMime in
 * backend/helpers/publicReports.js: up to three, pictures only.
 */
export const MAX_REPORT_PHOTOS = 3;

/** The picker's filter. HEIC rides along for iPhones; the API converts it. */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,.jpg,.jpeg,.png,.webp,.heic";

/** Longest side a report photo is sent at — plenty to see a leak by. */
const MAX_SIDE = 1600;
/** Below this a photo is sent as taken: shrinking would gain nothing. */
const SMALL_ENOUGH = 1.5 * 1024 * 1024;

export const isPhotoFile = (f: File) =>
  f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(f.name);

/**
 * A phone photo is 3–12 MB; three of them would be a slow send on mobile data
 * and can pass the server's request limit. Redrawn at MAX_SIDE as a JPEG it is
 * a few hundred KB. Whatever the browser cannot decode (HEIC outside Safari)
 * goes as it is, and the API converts it.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  if (file.size <= SMALL_ENOUGH || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * The request body: plain JSON when there are no photos (as the form always
 * sent), multipart when there are, with each photo under `photos`.
 */
export async function reportBody(fields: Record<string, string>, photos: File[]): Promise<FormData | Record<string, string>> {
  if (photos.length === 0) return fields;
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const p of await Promise.all(photos.map(shrinkPhoto))) form.append("photos", p, p.name);
  return form;
}
