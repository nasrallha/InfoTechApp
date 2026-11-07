// ============================================================
// وحدات الأنشطة (المصدر الوحيد): كل وحدة = شاشات وصلاحيات خاصة بنشاط معين
// - النشاط في لوحة التحكم بيحدد وحداته، والشركة ليها استثناءات
// - الوحدات المفعّلة بتتكتب في نسخة الاشتراك (subscription.modules)
// - الوحدة المقفولة: شاشاتها وحقولها بتختفي، وصلاحياتها مقفولة على الكل
//   (حتى مالك البرنامج، لأنها شكل النشاط مش قيد اشتراك)
// - لوحة التحكم بتقرا الملف ده (شاشة الأنشطة والشركات)
// ⚠ الملف ده من غير imports (اللوحة بتشغّله لوحده)
// ============================================================
export const MODULE_CATALOG = [
  {
    key: "serials",
    ar: "الأرقام التسلسلية والضمان",
    en: "Serial numbers and warranty",
    permissions: ["serials.view", "serials.warranties"],
  },
  {
    key: "warrantyClaims",
    ar: "طلبات الضمان والصيانة",
    en: "Warranty claims and repairs",
    permissions: [
      "warrantyClaims.view",
      "warrantyClaims.create",
      "warrantyClaims.update",
      "warrantyClaims.deliver",
      "warrantyClaims.cancel",
    ],
  },
  {
    key: "technicians",
    ar: "مقدمو الخدمة والعمولات (فني / عاملة / حلاق / معالج)",
    en: "Service providers & commissions",
    permissions: [
      "technicians.view",
      "technicians.create",
      "technicians.update",
      "technicians.delete",
      "technicians.jobs",
      "technicians.commissions",
    ],
  },
  {
    key: "maintenanceContracts",
    ar: "عقود الصيانة الدورية",
    en: "Periodic maintenance contracts",
    permissions: [
      "maintenanceContracts.view",
      "maintenanceContracts.create",
      "maintenanceContracts.update",
      "maintenanceContracts.cancel",
      "maintenanceContracts.visits",
    ],
  },
  {
    key: "followUps",
    ar: "المتابعة الدورية (الفلاتر والتحلية)",
    en: "Periodic follow-ups (filters)",
    permissions: ["followUps.view", "followUps.update"],
  },
  {
    key: "vehicles",
    ar: "السيارات (الورش): اللوحة والعداد وتغيير الزيت",
    en: "Vehicles (workshops): plate, odometer, oil change",
    permissions: [
      "vehicles.view",
      "vehicles.create",
      "vehicles.update",
      "vehicles.delete",
    ],
  },
  {
    key: "bookings",
    ar: "الحجوزات والمواعيد (الكوافير / الحلاق / المساج) + لينك الحجز",
    en: "Bookings & appointments (salon / barber / massage) + booking link",
    permissions: [
      "bookings.view",
      "bookings.create",
      "bookings.update",
      "bookings.cancel",
    ],
  },
  {
    key: "variants",
    ar: "المقاسات والألوان (الملابس والأحذية)",
    en: "Sizes and colors (clothing & shoes)",
    // من غير صلاحيات خاصة: توليد المقاسات بصلاحية إضافة الأصناف
    permissions: [],
  },
  {
    key: "laundry",
    ar: "المغسلة: القطع والخدمات والأسعار والإضافات",
    en: "Laundry: items, services, prices and add-ons",
    permissions: [
      "laundry.view",
      "laundry.manage",
      "laundryOrders.view",
      "laundryOrders.create",
      "laundryOrders.update",
      "laundryOrders.cancel",
      "laundrySubscriptions.view",
      "laundrySubscriptions.create",
      "laundrySubscriptions.cancel",
    ],
  },
  {
    key: "restaurant",
    ar: "المطعم والمقهى: الأحجام والإضافات والتطبيقات والتوصيل",
    en: "Restaurant & café: sizes, modifiers, delivery apps and drivers",
    permissions: ["restaurant.view", "restaurant.manage"],
  },
];

// صلاحيات الوحدات المقفولة (modules: مصفوفة مفاتيح الوحدات المفعّلة)
export function moduleBlockedPermissions(modules) {
  const on = new Set(Array.isArray(modules) ? modules : []);
  return MODULE_CATALOG.filter((m) => !on.has(m.key)).flatMap(
    (m) => m.permissions,
  );
}
