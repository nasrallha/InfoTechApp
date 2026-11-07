"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { toPng } from "html-to-image";
import { useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import {
  createPrintJobsAction,
  printJobsStatusAction,
} from "@/actions/print-agent.actions";
import { PRINT_AREA } from "./invoice/InvoiceView";

// نقط الطباعة (203dpi) لكل مقاس: 72mm = 576 | 48mm = 384
const DOTS = { "80mm": 576, "58mm": 384 };
const PX_PER_MM = 96 / 25.4;

// ============================================================
// الطباعة عن طريق وسيط الطباعة (من غير نافذة الطباعة)
// - بيرسم المستند (التذكرة / الفاتورة) مخفي بعرض الطابعة ← صورة PNG بدقة الطابعة
//   (نفس شكل الشاشة، والعربي سليم) ← مهمة طباعة على طابعتها
// - الوسيط مش متصل ← onFallback(item): الشاشة بتطبعه من المتصفح زي الأول
// - بيتابع المهام: لو طابعة فشلت ← تنبيه باسمها والسبب
// items: [{ key, printerId, title, paperSize, render: () => JSX }]
// ============================================================
export default function AgentPrinter({ items, onDone, onFallback }) {
  const t = useTranslations("PrintAgent");
  const box = useRef(null);
  const item = items[0] ?? null;
  const busy = useRef(null);

  useEffect(() => {
    if (!item || busy.current === item.key) return;
    busy.current = item.key;
    let alive = true;
    (async () => {
      try {
        await document.fonts?.ready;
        // الصور (الشعار / QR) لازم تكون اتحمّلت
        const imgs = [...(box.current?.querySelectorAll("img") ?? [])];
        await Promise.all(
          imgs.map((img) =>
            img.complete
              ? null
              : new Promise((r) => {
                  img.onload = r;
                  img.onerror = r;
                }),
          ),
        );
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const node = box.current?.firstElementChild;
        if (!node) throw new Error("render");
        const widthPx = node.offsetWidth || PRINT_AREA[item.paperSize] * PX_PER_MM;
        const dataUrl = await toPng(node, {
          backgroundColor: "#ffffff",
          pixelRatio: (DOTS[item.paperSize] ?? DOTS["80mm"]) / widthPx,
          cacheBust: false,
        });
        const res = await createPrintJobsAction([
          {
            printerId: item.printerId,
            image: dataUrl.slice(dataUrl.indexOf(",") + 1),
            title: item.title ?? null,
          },
        ]);
        if (!res.success || !res.data.online || !res.data.ids.length) {
          onFallback?.(item);
        } else {
          watch(res.data.ids, t);
        }
      } catch (e) {
        console.error("[agent-print]", e);
        onFallback?.(item);
      } finally {
        if (alive) onDone?.(item);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.key]);

  if (!item || typeof document === "undefined") return null;
  // مخفي بره الشاشة بعرض الطباعة الفعلي
  return createPortal(
    <div
      ref={box}
      aria-hidden
      style={{
        position: "fixed",
        left: -10000,
        top: 0,
        width: `${PRINT_AREA[item.paperSize] ?? 72}mm`,
        background: "white",
        pointerEvents: "none",
      }}
    >
      <div style={{ width: `${PRINT_AREA[item.paperSize] ?? 72}mm` }}>{item.render()}</div>
    </div>,
    document.body,
  );
}

// متابعة المهام: بعد 3 ثواني و10 ثواني، واللي فشل بيظهر تنبيه
function watch(ids, t) {
  let pending = [...ids];
  const check = async () => {
    const res = await printJobsStatusAction(pending);
    if (!res.success) return;
    for (const j of res.data) {
      if (j.status === "failed")
        message.error({
          duration: 10,
          content: t("PrintFailed", { printer: j.printer ?? "", error: j.error ?? "" }),
        });
    }
    pending = res.data
      .filter((j) => j.status === "queued" || j.status === "taken")
      .map((j) => j.id);
  };
  setTimeout(check, 3000);
  setTimeout(() => pending.length && check(), 10_000);
  setTimeout(() => {
    if (!pending.length) return;
    check().then(() => {
      if (pending.length) message.warning(t("PrintSlow"));
    });
  }, 25_000);
}
