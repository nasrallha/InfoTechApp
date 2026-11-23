"use client";

import { createContext, useContext } from "react";

// ============================================================
// إعداد الطباعة على الجهاز ده (من السيرفر في الـ layout):
// { drawerMode, printer: { id, name, connection, paperSize, copies } | null }
// printer شبكة / ويندوز ← الإيصال بيروح لوسيط الطباعة (ومعاه فتح الدرج)
// printer null / المتصفح ← نافذة الطباعة زي الأول
// ============================================================
const Ctx = createContext({ drawerMode: "cash", printer: null });

export function DevicePrintProvider({ config, children }) {
  return <Ctx value={config ?? { drawerMode: "cash", printer: null }}>{children}</Ctx>;
}

export const useDevicePrint = () => useContext(Ctx);

// الإيصال بيروح للوسيط؟ (طابعة شبكة / ويندوز)
export const agentPrinter = (config) =>
  config?.printer && config.printer.connection && config.printer.connection !== "browser"
    ? config.printer
    : null;
