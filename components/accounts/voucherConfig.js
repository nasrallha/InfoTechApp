import { C } from "@/lib/theme";
// إعدادات شاشات السندات (مشتركة بين القائمة والإضافة والعرض)

export const VOUCHER_PATH = {
  receipt: "/accounts/receipts",
  payment: "/accounts/payments",
  settlement: "/accounts/settlements",
  offset: "/accounts/offsets",
};

export const VOUCHER_COLOR = {
  receipt: C.successText,
  payment: C.dangerText,
  settlement: C.purple,
  offset: C.infoText,
};

// الأطراف المسموحة لكل نوع (نفس ترتيب السيرفر)
export const VOUCHER_PARTIES = {
  receipt: ["customer", "other"],
  payment: ["supplier", "expense"],
  settlement: ["customer", "supplier"],
  offset: ["offset"],
};

export const PARTY_TAG = {
  customer: "blue",
  supplier: "orange",
  expense: "red",
  other: "default",
  offset: "cyan",
};
