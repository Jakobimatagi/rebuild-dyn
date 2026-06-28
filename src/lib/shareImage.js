import { toPng } from "html-to-image";

// Shared share-card export helper. Every admin share modal renders its cards
// at a fixed 1080px width and exports them with html-to-image's toPng. This
// helper centralizes that call and adds an optional "TikTok mode": the
// captured card is composited onto a 1080×1920 (9:16) vertical frame so the
// PNG drops straight into TikTok / Reels / Shorts without manual cropping.

const CARD_BG = "#020617";

// Logical 9:16 frame. Multiplied by pixelRatio for the actual canvas size so
// the framed export stays as crisp as the un-framed one.
export const TIKTOK_W = 1080;
export const TIKTOK_H = 1920;

// Capture a share-card DOM node to a PNG data URL.
//   tiktok          – when true, pad/scale the card into a 1080×1920 frame
//   pixelRatio      – passed to toPng (default 2, matches existing call sites)
//   backgroundColor – card + frame fill (default slate-950)
//   ...rest         – any other toPng option (e.g. skipFonts)
export async function captureShareImage(
  node,
  { tiktok = false, pixelRatio = 2, backgroundColor = CARD_BG, ...rest } = {},
) {
  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio,
    backgroundColor,
    ...rest,
  });
  if (!tiktok) return dataUrl;
  return frameForTikTok(dataUrl, { backgroundColor, pixelRatio });
}

// Draw the captured card centered on a 9:16 canvas. The card keeps its full
// 1080 width whenever it fits; taller-than-frame cards scale down so nothing
// is clipped. Either way the empty space top/bottom is filled with the card
// background so the seam is invisible.
function frameForTikTok(dataUrl, { backgroundColor, pixelRatio }) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = TIKTOK_W * pixelRatio;
        canvas.height = TIKTOK_H * pixelRatio;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(
          canvas.width / img.width,
          canvas.height / img.height,
          1,
        );
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Append a "-tiktok" tag before the .png extension when in TikTok mode so the
// vertical and native exports don't overwrite each other in Downloads.
export function tiktokFilename(name, tiktok) {
  if (!tiktok) return name;
  return name.replace(/\.png$/i, "") + "-tiktok.png";
}
