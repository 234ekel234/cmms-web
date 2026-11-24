"use client";

import { useRef } from "react";
import { MAX_REPORT_PHOTOS, PHOTO_ACCEPT, isPhotoFile } from "@/lib/reportPhotos";

/**
 * One preview URL per picked file, made once. Not revoked in an effect: strict
 * mode runs cleanups and re-runs effects in development, which revoked the URLs
 * a memo still held. A form's worth of previews is a few small blobs, freed when
 * the page goes.
 */
const previewUrls = new WeakMap<File, string>();
function previewOf(file: File) {
  let url = previewUrls.get(file);
  if (!url) { url = URL.createObjectURL(file); previewUrls.set(file, url); }
  return url;
}

/**
 * Up to three photos on a problem report, with previews and a remove button
 * each. On a phone the picker offers the camera as well as the gallery. The
 * parent holds the files; `onError` says why a pick was refused.
 */
export default function ReportPhotoPicker({
  photos,
  onChange,
  onError,
  disabled,
}: {
  photos: File[];
  onChange: (files: File[]) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);

  function add(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list);
    const images = picked.filter(isPhotoFile);
    if (images.length < picked.length) onError("Only photos can be attached.");
    const room = MAX_REPORT_PHOTOS - photos.length;
    if (images.length > room) onError(`Up to ${MAX_REPORT_PHOTOS} photos.`);
    onChange([...photos, ...images.slice(0, Math.max(0, room))]);
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      <span className="tu-label">Photos (optional)</span>
      <div className="flex flex-wrap gap-2 mt-1">
        {photos.map((f, i) => (
          <div key={`${f.name}-${i}`} className="relative" style={{ width: 84, height: 84 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewOf(f)}
              alt={`Photo ${i + 1}`}
              className="w-full h-full object-cover rounded-lg border border-[var(--tu-border)]"
            />
            <button
              type="button"
              onClick={() => onChange(photos.filter((_, j) => j !== i))}
              disabled={disabled}
              aria-label={`Remove photo ${i + 1}`}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[var(--tu-bg-surface)] border border-[var(--tu-border)] text-xs leading-none cursor-pointer shadow"
            >
              ✕
            </button>
          </div>
        ))}
        {photos.length < MAX_REPORT_PHOTOS && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={disabled}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--tu-border)] text-xs text-[var(--tu-text-subtle)] cursor-pointer hover:border-[var(--tu-text-brand)]"
            style={{ width: 84, height: 84 }}
          >
            <span className="text-xl leading-none" aria-hidden="true">＋</span>
            Add photo
          </button>
        )}
      </div>
      <input ref={input} type="file" accept={PHOTO_ACCEPT} multiple hidden onChange={(e) => add(e.target.files)} />
      <p className="text-xs text-[var(--tu-text-subtle)] mt-1">Up to {MAX_REPORT_PHOTOS}. A picture helps the team bring the right tools.</p>
    </div>
  );
}
