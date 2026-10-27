"use client";

/**
 * A failed save, delete or toggle, said where the person will see it. Writes
 * used to fail into `catch { // silent }`, which left the screen showing a
 * change the server had refused. Dismissible, because the page stays usable
 * and the next attempt clears it anyway.
 */
export default function ActionError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div className="tu-action-error" role="alert">
      <span>{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss">×</button>
    </div>
  );
}
