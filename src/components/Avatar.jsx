import { useState } from "react";

function initialsFrom(label) {
  if (!label) return "?";
  const words = String(label).trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return String(label).slice(0, 2).toUpperCase();
}

export default function Avatar({ src, alt = "", label, size = 28 }) {
  const [errored, setErrored] = useState(false);
  const showFallback = !src || errored;

  if (showFallback) {
    return (
      <div
        aria-label={alt || label || "avatar"}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.max(9, Math.round(size * 0.36)),
          fontWeight: 700,
          color: "#9ca3b8",
          flexShrink: 0,
          letterSpacing: 0.5,
        }}
      >
        {initialsFrom(label || alt)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setErrored(true)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        background: "rgba(255,255,255,0.04)",
      }}
    />
  );
}
