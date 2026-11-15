// ============================================================
// تنظيف صورة رسمة (في المتصفح قبل الرفع) - نفس اللي اتعمل في رسومات الكارت:
// 1) الورق الرمادي / الضل ← أبيض، والخطوط تفضل غامقة (فاتح أكتر + تباين أعلى)
// 2) الفراغ اللي حوالين الرسمة بيتشال (مع هامش صغير)
// 3) أكبر ضلع 400 بكسل ← PNG
// file: الصورة اللي اتصورت بالموبايل أو اتقصت من كارت ← File جديد نضيف
// ============================================================
const MAX_SIDE = 400;

export async function cleanDrawing(file) {
  // الصورة بالاتجاه الصح (صور الموبايل)
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const w = bmp.width;
  const h = bmp.height;
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const ctx = src.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;

  // فاتح 25% وبعدين تباين: v * 1.8 - 140 (الورق ← أبيض والخط ← غامق)
  const tone = (v) =>
    Math.max(0, Math.min(255, Math.round(v * 1.25 * 1.8 - 140)));
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = tone(px[i]);
      const g = tone(px[i + 1]);
      const b = tone(px[i + 2]);
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
      // نقطة من الرسمة (مش ورق أبيض)
      if (Math.min(r, g, b) < 170) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  // مفيش رسمة واضحة ← الصورة كلها
  if (maxX < 0) {
    minX = 0;
    minY = 0;
    maxX = w - 1;
    maxY = h - 1;
  }
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.06);
  const cx = Math.max(0, minX - pad);
  const cy = Math.max(0, minY - pad);
  const cw = Math.min(w, maxX + pad + 1) - cx;
  const ch = Math.min(h, maxY + pad + 1) - cy;
  const scale = Math.min(1, MAX_SIDE / Math.max(cw, ch));

  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cw * scale));
  out.height = Math.max(1, Math.round(ch * scale));
  const octx = out.getContext("2d");
  octx.fillStyle = "white";
  octx.fillRect(0, 0, out.width, out.height);
  octx.imageSmoothingQuality = "high";
  octx.drawImage(src, cx, cy, cw, ch, 0, 0, out.width, out.height);

  const blob = await new Promise((resolve) => out.toBlob(resolve, "image/png"));
  return new File([blob], "drawing.png", { type: "image/png" });
}
