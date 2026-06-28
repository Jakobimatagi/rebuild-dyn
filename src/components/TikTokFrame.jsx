import { useLayoutEffect, useRef, useState } from "react";
import { TIKTOK_W, TIKTOK_H } from "../lib/shareImage.js";

// Preview wrapper that shows a share card inside the same 1080×1920 (9:16)
// frame the TikTok export produces, so the on-screen preview is WYSIWYG.
// When `enabled` is false it renders children untouched (zero layout impact).
//
// The wrapped card keeps its natural 1080px width; cards taller than the frame
// are scaled down to fit — mirroring frameForTikTok() in shareImage.js — so the
// preview matches the exported PNG exactly. The capture ref still lives on the
// inner card, so html-to-image captures the card standalone regardless of the
// transform applied here.
export default function TikTokFrame({ enabled, children }) {
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    if (!enabled) return;
    const el = innerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.offsetWidth || TIKTOK_W;
      const h = el.offsetHeight || TIKTOK_H;
      setScale(Math.min(TIKTOK_W / w, TIKTOK_H / h, 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled]);

  if (!enabled) return children;

  return (
    <div
      style={{ width: TIKTOK_W, height: TIKTOK_H }}
      className="bg-slate-950 flex items-center justify-center overflow-hidden shrink-0"
    >
      <div ref={innerRef} style={{ transform: `scale(${scale})`, transformOrigin: "center" }}>
        {children}
      </div>
    </div>
  );
}
