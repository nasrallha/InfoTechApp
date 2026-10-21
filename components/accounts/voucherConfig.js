// إعدادات شاشات السندات (مشتركة بين القائمة والإضافة والعرض)

export const VOUCHER_PATH = {
  receipt: "/accounts/receipts",
  payment: "/accounts/payments",
  settlement: "/accounts/settlements",
};

export const VOUCHER_COLOR = {
  receipt: "#1e8449",
  payment: "#c0392b",
  settlement: "#7d3c98",
};

// الأطراف المسموحة لكل نوع (نفس ترتيب السيرفر)
export const VOUCHER_PARTIES = {
  receipt: ["customer", "other"],
  payment: ["supplier", "expense"],
  settlement: ["customer", "supplier"],
};

export const PARTY_TAG = {
  customer: "blue",
  supplier: "orange",
  expense: "red",
  other: "default",
};
