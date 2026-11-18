// ============================================================
// أيقونة دايرة (تبويب المتصفح) من صورة اللوجو: SVG فيه الصورة جوه دايرة
// بخلفية بيضا وإطار بلون البرنامج (نفس شكل اللوجو اللي تحت في القايمة الجانبية)
// ============================================================
import { C } from "@/lib/theme";

export function circleIconSvg(bytes, contentType) {
  const data = `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><clipPath id="c"><circle cx="32" cy="32" r="27"/></clipPath></defs>
<circle cx="32" cy="32" r="30" fill="${C.surface}" stroke="${C.accent}" stroke-width="4"/>
<image href="${data}" x="9" y="9" width="46" height="46" preserveAspectRatio="xMidYMid meet" clip-path="url(#c)"/>
</svg>`;
}
