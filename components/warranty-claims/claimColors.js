import { C } from "@/lib/theme";
// لون كل مرحلة في طلبات الضمان والصيانة (الفلاتر، الصفوف، شريط المراحل)
export const CLAIM_COLORS = {
  open: C.warning,
  received: C.info,
  inspecting: C.info,
  at_agent: C.purple,
  back: C.accent,
  ready: C.success,
  delivered: C.muted,
  cancelled: C.danger,
  all: C.text2,
  invoiced: C.warning,
};
