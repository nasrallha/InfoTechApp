"use client";

import { toPng } from "html-to-image";
import { createPrintJobsAction } from "@/actions/print-agent.actions";
import { PRINT_AREA } from "./invoice/InvoiceView";

// نقط الطباعة (203dpi) لكل مقاس: 72mm = 576 | 48mm = 384
const DOTS = { "80mm": 576, "58mm": 384 };
const PX_PER_MM = 96 / 25.4;

// ============================================================
// إيصال مرسوم في الصفحة ← صورة بدقة الطابعة ← مهمة على وسيط الطباعة
// (طابعة الإيصالات على الجهاز: شبكة / ويندوز) + فتح الدرج لو مطلوب
// بيرجّع أرقام المهام، أو null لو الوسيط مش متصل / فشل (← نافذة الطباعة)
// ============================================================
export async function printViaAgent(node, { paperSize, printerId, title, openDrawer }) {
  const paper = paperSize === "58mm" ? "58mm" : "80mm";
  const widthPx = node.offsetWidth || PRINT_AREA[paper] * PX_PER_MM;
  const dataUrl = await toPng(node, {
    backgroundColor: "#ffffff",
    pixelRatio: DOTS[paper] / widthPx,
    cacheBust: false,
  });
  const res = await createPrintJobsAction([
    {
      printerId,
      image: dataUrl.slice(dataUrl.indexOf(",") + 1),
      title: title ?? null,
      openDrawer: Boolean(openDrawer),
    },
  ]);
  if (!res.success || !res.data.online || !res.data.ids.length) return null;
  return res.data.ids;
}
