import { C } from "@/lib/theme";

// لون كل حالة من حالات طلب المغسلة (الفلاتر والتاجات)
export const ORDER_COLORS = {
  open: C.primary,
  received: C.info,
  processing: C.warning,
  ready: C.success,
  delivered: C.muted,
  cancelled: C.danger,
  all: C.navy,
};
