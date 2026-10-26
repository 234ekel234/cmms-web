"use client";

/**
 * One notification toggle.
 *
 * `hidden` keeps the slot occupied rather than removing it, so the In app and
 * Email columns stay aligned down the list even when a row offers only one of
 * them — otherwise a row with no email switch would slide its bell toggle under
 * the Email heading.
 */
export default function Switch({
  on, onToggle, label, hidden = false,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  hidden?: boolean;
}) {
  if (hidden) return <div style={{ width: 44, height: 24 }} aria-hidden="true" />;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      style={{
        position: "relative",
        width: 44,
        height: 24,
        flexShrink: 0,
        border: "none",
        padding: 0,
        borderRadius: 12,
        background: on ? "var(--tu-text-brand)" : "var(--tu-border)",
        transition: "background 200ms",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: on ? 22 : 2,
          top: 2,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 200ms",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          pointerEvents: "none",
        }}
      />
    </button>
  );
}
