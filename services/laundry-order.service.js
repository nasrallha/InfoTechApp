import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { assertModule } from "@/lib/modules";
import { runTx } from "@/lib/transaction";
import { bizDayEnd, bizDayStart, bizToday } from "@/lib/business-day";
import { dayToDbDate, dbDateToDay } from "@/lib/dates";
import { createCustomer } from "./customer.service";
import { can } from "@/lib/permissions";

// ============================================================
// المغسلة (وحدة laundry) - طلبات الاستلام (المرحلة 2-أ)
// - الطلب = المرجع: العميل لو ضيّع الإيصال بنلاقي طلباته بالجوال
// - رقم الطلب يومي (dailyNo) يبدأ من 1 كل يوم عمل، ولكل فرع لوحده
//   والـ id هو الرقم الفريد (باركود الإيصال: LO + id)
// - العميل إجباري بالجوال: لو الجوال مش مسجل بيتعمل عميل جديد
//   (الاسم اختياري: من غير اسم = الجوال نفسه)
// - السعر من قائمة أسعار المغسلة وقت الاستلام (السيرفر بيحسبه)
// - التعديل لحد "قيد التنفيذ" بس: الجاهز اتقفل (الهدوم اتغسلت فعلاً)
// - الحالة بتمشي لقدّام: مستلَم ← قيد التنفيذ ← جاهز (الجاهز ما يرجعش)
// - الإلغاء قبل الفوترة والتسليم بس
// ============================================================

// اللي لسه ما اتسلمش
const OPEN = ["received", "processing", "ready"];
// اللي ينفع يتعدل (قطعه وعميله)
const EDITABLE = ["received", "processing"];
// الحالة الجديدة ← من أنهي حالات ينفع نوصلها
const STATUS_FROM = {
  processing: ["received"],
  ready: ["received", "processing"],
  // رجوع خطوة لو اتضغط بالغلط (قبل ما يجهز)
  received: ["processing"],
};
const n = (v) => (v == null ? 0 : Number(v));

const settingsHour = async () =>
  (
    await prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { dayStartHour: true },
    })
  )?.dayStartHour ?? 0;

const customerSel = {
  id: true,
  code: true,
  arName: true,
  enName: true,
  phone: true,
  isActive: true,
};

const orderSel = {
  id: true,
  branchId: true,
  bizDay: true,
  dailyNo: true,
  customerId: true,
  customerName: true,
  phone: true,
  status: true,
  isUrgent: true,
  totalQty: true,
  totalAmount: true,
  notes: true,
  saleId: true,
  readyAt: true,
  deliveredAt: true,
  cancelledAt: true,
  cancelReason: true,
  createdAt: true,
  createdBy: { select: { arFullname: true, enFullname: true } },
  sale: { select: { id: true, type: true, number: true, docCode: true } },
};

const itemSel = {
  id: true,
  productId: true,
  serviceId: true,
  arName: true,
  enName: true,
  serviceArName: true,
  serviceEnName: true,
  isUrgent: true,
  qty: true,
  price: true,
  total: true,
  addons: true,
  notes: true,
};

const toItem = (i) => ({
  ...i,
  price: n(i.price),
  total: n(i.total),
  addons: Array.isArray(i.addons) ? i.addons : [],
});

const toOrder = (o) => ({
  ...o,
  bizDay: dbDateToDay(o.bizDay),
  totalAmount: n(o.totalAmount),
  ...(o.items ? { items: o.items.map(toItem) } : {}),
});

// الطلب في فرع المستخدم (كل فرع منفصل)
async function findOrder(id, user, select = orderSel) {
  const o = await prisma.laundryOrder.findFirst({
    where: { id, branchId: user.branch.id },
    select,
  });
  if (!o) throw new AppError("LaundryOrderNotFound");
  return o;
}

// ------------------------------------------------------------
// شاشة الاستلام: القطع بأسعارها + الخدمات + الإضافات (المفعّل بس)
// ------------------------------------------------------------
export async function getReceiveCatalog() {
  await assertModule("laundry");
  const orderBy = [{ sortOrder: "asc" }, { id: "asc" }];
  const [services, groups, items] = await Promise.all([
    prisma.laundryService.findMany({
      where: { isActive: true },
      orderBy,
      select: { id: true, arName: true, enName: true },
    }),
    prisma.laundryAddonGroup.findMany({
      where: { isActive: true },
      orderBy,
      select: {
        id: true,
        arName: true,
        enName: true,
        multiple: true,
        addons: {
          where: { isActive: true },
          orderBy,
          select: { id: true, arName: true, enName: true },
        },
      },
    }),
    prisma.laundryItem.findMany({
      where: { product: { isActive: true } },
      orderBy: [{ sortOrder: "asc" }, { productId: "asc" }],
      select: {
        productId: true,
        product: {
          // + بيانات سطر الفاتورة في الكاشير (الوحدة والضريبة)
          select: {
            code: true,
            arName: true,
            enName: true,
            image: true,
            taxRate: true,
            isPriceIncludeTax: true,
            categoryId: true,
            baseUnit: { select: { id: true, arName: true, enName: true } },
          },
        },
        prices: {
          where: { service: { isActive: true } },
          select: { serviceId: true, price: true, urgentPrice: true },
        },
      },
    }),
  ]);
  return {
    services,
    groups: groups.filter((g) => g.addons.length),
    // القطعة اللي مالهاش ولا خدمة متاحة ما تظهرش
    items: items
      .filter((i) => i.prices.length)
      .map((i) => ({
        productId: i.productId,
        ...i.product,
        taxRate: n(i.product.taxRate),
        prices: i.prices.map((p) => ({
          serviceId: p.serviceId,
          price: n(p.price),
          urgentPrice: p.urgentPrice == null ? null : n(p.urgentPrice),
        })),
      })),
  };
}

// ------------------------------------------------------------
// العميل بالجوال: بياناته + طلباته اللي لسه ما اتسلمتش
// ------------------------------------------------------------
export async function lookupLaundryCustomer(phone, user) {
  await assertModule("laundry");
  const customer = await prisma.customer.findUnique({
    where: { phone },
    select: customerSel,
  });
  if (!customer) return { customer: null, open: [] };
  const open = await prisma.laundryOrder.findMany({
    where: {
      customerId: customer.id,
      branchId: user.branch.id,
      status: { in: OPEN },
    },
    orderBy: { id: "desc" },
    take: 20,
    select: {
      id: true,
      bizDay: true,
      dailyNo: true,
      status: true,
      totalQty: true,
      totalAmount: true,
      saleId: true,
    },
  });
  return { customer, open: open.map(toOrder) };
}

// العميل: الموجود (بالـ id أو بالجوال)، أو عميل جديد بالاسم والجوال
export async function resolveCustomer({ customerId, phone, customerName }) {
  if (customerId) {
    const c = await prisma.customer.findUnique({
      where: { id: customerId },
      select: customerSel,
    });
    if (!c)
      throw new AppError("CustomerNotFound", null, {
        phone: "CustomerNotFound",
      });
    // الجوال لازم يكون جوال العميل ده (الشاشة بتجيبه بالجوال)
    if (c.phone !== phone)
      throw new AppError("LaundryPhoneMismatch", null, {
        phone: "LaundryPhoneMismatch",
      });
    return c;
  }
  const found = await prisma.customer.findUnique({
    where: { phone },
    select: customerSel,
  });
  if (found) return found;
  // عميل جديد: الاسم اختياري (من غير اسم = الجوال، ويتعدل بعدين من العملاء)
  const name = customerName?.trim() || phone;
  try {
    const c = await createCustomer({
      arName: name,
      enName: name,
      phone,
      isActive: true,
    });
    return c;
  } catch (e) {
    // اتسجل في نفس اللحظة من جهاز تاني بنفس الجوال
    const again = await prisma.customer.findUnique({
      where: { phone },
      select: customerSel,
    });
    if (again) return again;
    throw e;
  }
}

// السطور: القطعة صنف مغسلة، والخدمة متاحة لها، والمستعجل متاح،
// والإضافات موجودة ومفعّلة (مجموعة الاختيار الواحد: إضافة واحدة بس)
// allowPrice: المستخدم يقدر يغيّر السعر (sales.changePrice) ← السعر المكتوب على السطر
export async function buildLines(items, { allowPrice = false } = {}) {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const addonIds = [...new Set(items.flatMap((i) => i.addonIds))];
  const [laundryItems, addons] = await Promise.all([
    prisma.laundryItem.findMany({
      where: { productId: { in: productIds } },
      select: {
        productId: true,
        product: { select: { arName: true, enName: true, isActive: true } },
        prices: {
          select: {
            serviceId: true,
            price: true,
            urgentPrice: true,
            service: {
              select: { arName: true, enName: true, isActive: true },
            },
          },
        },
      },
    }),
    addonIds.length
      ? prisma.laundryAddon.findMany({
          where: { id: { in: addonIds } },
          select: {
            id: true,
            groupId: true,
            arName: true,
            enName: true,
            isActive: true,
            group: { select: { multiple: true, isActive: true } },
          },
        })
      : [],
  ]);
  const byProduct = new Map(laundryItems.map((i) => [i.productId, i]));
  const byAddon = new Map(addons.map((a) => [a.id, a]));

  return items.map((line) => {
    const item = byProduct.get(line.productId);
    if (!item || !item.product.isActive)
      throw new AppError("LaundryItemNotFound");
    const p = item.prices.find((x) => x.serviceId === line.serviceId);
    if (!p || !p.service.isActive)
      throw new AppError("LaundryServiceNotAvailable", [item.product]);
    if (line.isUrgent && p.urgentPrice == null)
      throw new AppError("LaundryUrgentNotAvailable", [item.product]);
    const picked = [...new Set(line.addonIds)].map((id) => byAddon.get(id));
    if (picked.some((a) => !a || !a.isActive || !a.group.isActive))
      throw new AppError("LaundryAddonNotFound");
    // مجموعة الاختيار الواحد (النشا مثلاً): إضافة واحدة بس
    const perGroup = new Map();
    for (const a of picked) {
      if (a.group.multiple) continue;
      if (perGroup.has(a.groupId))
        throw new AppError("LaundryAddonSingleChoice", [a]);
      perGroup.set(a.groupId, a.id);
    }
    const listPrice = n(line.isUrgent ? p.urgentPrice : p.price);
    const price =
      allowPrice && line.price != null
        ? Math.round(line.price * 100) / 100
        : listPrice;
    return {
      productId: line.productId,
      serviceId: line.serviceId,
      arName: item.product.arName,
      enName: item.product.enName,
      serviceArName: p.service.arName,
      serviceEnName: p.service.enName,
      isUrgent: line.isUrgent,
      qty: line.qty,
      price,
      total: Math.round(price * line.qty * 100) / 100,
      addons: picked.map((a) => ({
        id: a.id,
        groupId: a.groupId,
        arName: a.arName,
        enName: a.enName,
      })),
      notes: line.notes ?? null,
    };
  });
}

const totalsOf = (lines) => ({
  isUrgent: lines.some((l) => l.isUrgent),
  totalQty: lines.reduce((s, l) => s + l.qty, 0),
  totalAmount:
    Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100,
});

// ------------------------------------------------------------
// الاستلام: طلب جديد
// ------------------------------------------------------------
export async function createLaundryOrder(data, user) {
  await assertModule("laundry");
  const customer = await resolveCustomer(data);
  const lines = await buildLines(data.items, {
    allowPrice: can(user, "sales.changePrice"),
  });
  const day = bizToday(await settingsHour());
  const branchId = user.branch.id;
  // العدّاد: لكل فرع ولكل يوم عمل (LO-<الفرع>-<YYYYMMDD>)
  const key = `LO-${branchId}-${day.replace(/-/g, "")}`;
  const order = await runTx(async (tx) => {
    const seq = await tx.documentSequence.upsert({
      where: { key },
      create: { key, last: 1 },
      update: { last: { increment: 1 } },
      select: { last: true },
    });
    return tx.laundryOrder.create({
      data: {
        branchId,
        bizDay: dayToDbDate(day),
        dailyNo: seq.last,
        customerId: customer.id,
        customerName: customer.arName,
        phone: data.phone,
        notes: data.notes ?? null,
        ...totalsOf(lines),
        createdById: user.id,
        items: { create: lines },
      },
      select: { id: true },
    });
  });
  return getLaundryOrder(order.id, user);
}

// ------------------------------------------------------------
// تعديل الطلب: مستلَم أو قيد التنفيذ ومن غير فاتورة (السطور بتتبدل بالكامل)
// ------------------------------------------------------------
export async function updateLaundryOrder({ id, ...data }, user) {
  await assertModule("laundry");
  const current = await findOrder(id, user, {
    id: true,
    status: true,
    saleId: true,
  });
  if (!EDITABLE.includes(current.status) || current.saleId)
    throw new AppError("LaundryOrderLocked");
  const customer = await resolveCustomer(data);
  const lines = await buildLines(data.items, {
    allowPrice: can(user, "sales.changePrice"),
  });
  await runTx(async (tx) => {
    // ما يكونش جهز أو اتفوتر أو اتسلم في نفس اللحظة
    const { count } = await tx.laundryOrder.updateMany({
      where: { id, saleId: null, status: { in: EDITABLE } },
      data: {
        customerId: customer.id,
        customerName: customer.arName,
        phone: data.phone,
        notes: data.notes ?? null,
        ...totalsOf(lines),
      },
    });
    if (!count) throw new AppError("LaundryOrderLocked");
    await tx.laundryOrderItem.deleteMany({ where: { orderId: id } });
    await tx.laundryOrderItem.createMany({
      data: lines.map((l) => ({ ...l, orderId: id })),
    });
  });
  return getLaundryOrder(id, user);
}

// ------------------------------------------------------------
// الطلب بالتفصيل (العرض والإيصال)
// ------------------------------------------------------------
export async function getLaundryOrder(id, user) {
  await assertModule("laundry");
  const o = await findOrder(id, user, {
    ...orderSel,
    branch: { select: { id: true, arName: true, enName: true } },
    customer: { select: customerSel },
    items: { orderBy: { id: "asc" }, select: itemSel },
  });
  return toOrder(o);
}

// ------------------------------------------------------------
// لوحة الطلبات (فرع المستخدم)
// q: جوال | رقم يومي (مع اليوم) | باركود الإيصال LO<id> | اسم العميل
// ------------------------------------------------------------
export async function listLaundryOrders({ q, day, from, to, status }, user) {
  await assertModule("laundry");
  const h = await settingsHour();
  const text = q.trim();
  const where = { branchId: user.branch.id };
  const barcode = /^LO(\d+)$/i.exec(text);
  if (barcode) where.id = Number(barcode[1]);
  else if (/^\d{9,11}$/.test(text)) where.phone = text;
  else if (/^\d{1,6}$/.test(text)) {
    // الرقم اليومي بيتكرر كل يوم ← لازم اليوم (الافتراضي النهارده)
    where.dailyNo = Number(text);
    where.bizDay = dayToDbDate(day || bizToday(h));
  } else if (text) {
    where.OR = [
      { customerName: { contains: text } },
      { customer: { arName: { contains: text } } },
      { customer: { enName: { contains: text } } },
    ];
  }
  // الفترة (أيام العمل) لو مش بحث برقم أو باركود
  if (!where.id && !where.bizDay && (from || to)) {
    where.bizDay = {
      ...(from ? { gte: dayToDbDate(from) } : {}),
      ...(to ? { lte: dayToDbDate(to) } : {}),
    };
  }
  const statusWhere =
    status === "all"
      ? {}
      : status === "open"
        ? { status: { in: OPEN } }
        : { status };
  const [rows, grouped] = await Promise.all([
    prisma.laundryOrder.findMany({
      where: { ...where, ...statusWhere },
      // المستعجل الأول، وبعدين الأقدم (اللي مستني أكتر)
      orderBy:
        status === "open"
          ? [{ isUrgent: "desc" }, { id: "asc" }]
          : [{ id: "desc" }],
      take: 500,
      select: orderSel,
    }),
    prisma.laundryOrder.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
  ]);
  const counts = Object.fromEntries(
    grouped.map((g) => [g.status, g._count._all]),
  );
  counts.open = OPEN.reduce((s, k) => s + (counts[k] ?? 0), 0);
  counts.all = grouped.reduce((s, g) => s + g._count._all, 0);
  return { rows: rows.map(toOrder), counts };
}

// ------------------------------------------------------------
// الحالة: مستلَم / قيد التنفيذ / جاهز (لطلب أو أكتر)
// لقدّام بس (STATUS_FROM): الجاهز ما يرجعش، والمسلَّم والملغي ما يتغيروش
// ------------------------------------------------------------
export async function setLaundryOrderStatus({ ids, status }, user) {
  await assertModule("laundry");
  const { count } = await prisma.laundryOrder.updateMany({
    where: {
      id: { in: ids },
      branchId: user.branch.id,
      status: { in: STATUS_FROM[status] },
    },
    data: {
      status,
      ...(status === "ready" ? { readyAt: new Date() } : {}),
    },
  });
  if (!count) throw new AppError("LaundryOrderLocked");
  return { updated: count };
}

// الإلغاء: قبل الفوترة والتسليم بس
export async function cancelLaundryOrder({ id, reason }, user) {
  await assertModule("laundry");
  await findOrder(id, user, { id: true });
  const { count } = await prisma.laundryOrder.updateMany({
    where: { id, saleId: null, status: { in: OPEN } },
    data: {
      status: "cancelled",
      cancelledAt: new Date(),
      cancelReason: reason ?? null,
    },
  });
  if (!count) throw new AppError("LaundryOrderLocked");
  return { id };
}

// ------------------------------------------------------------
// ملخص اليوم (فرع المستخدم)
// - registered: طلبات اليوم (من غير الملغي) وقطعها
// - delivered: اللي اتسلم في اليوم ده (حتى لو من أيام قبله)
// - remaining: كل اللي لسه ما اتسلمش (من أي يوم)، ومنها الجاهز
// ------------------------------------------------------------
export async function laundryDaySummary(dayInput, user) {
  await assertModule("laundry");
  const h = await settingsHour();
  const day = dayInput || bizToday(h);
  const branchId = user.branch.id;
  const [registered, delivered, cancelled, remaining] = await Promise.all([
    prisma.laundryOrder.aggregate({
      where: { branchId, bizDay: dayToDbDate(day), status: { not: "cancelled" } },
      _count: { _all: true },
      _sum: { totalQty: true, totalAmount: true },
    }),
    prisma.laundryOrder.aggregate({
      where: {
        branchId,
        status: "delivered",
        deliveredAt: { gte: bizDayStart(day, h), lte: bizDayEnd(day, h) },
      },
      _count: { _all: true },
      _sum: { totalQty: true },
    }),
    prisma.laundryOrder.count({
      where: { branchId, bizDay: dayToDbDate(day), status: "cancelled" },
    }),
    prisma.laundryOrder.groupBy({
      by: ["status"],
      where: { branchId, status: { in: OPEN } },
      _count: { _all: true },
      _sum: { totalQty: true },
    }),
  ]);
  const rem = Object.fromEntries(remaining.map((g) => [g.status, g]));
  const sumRem = (key) =>
    remaining.reduce((s, g) => s + (key(g) ?? 0), 0);
  return {
    day,
    registered: {
      orders: registered._count._all,
      qty: registered._sum.totalQty ?? 0,
      amount: n(registered._sum.totalAmount),
    },
    delivered: {
      orders: delivered._count._all,
      qty: delivered._sum.totalQty ?? 0,
    },
    cancelled,
    remaining: {
      orders: sumRem((g) => g._count._all),
      qty: sumRem((g) => g._sum.totalQty),
      ready: rem.ready?._count._all ?? 0,
    },
  };
}

// ============================================================
// الفوترة (من الكاشير): طلب أو أكتر ← فاتورة بيع واحدة
// - الطلبات اللي لسه ما اتفوترتش ومش ملغية، ولنفس العميل
// - سطور الفاتورة من الطلبات نفسها (السيرفر)، مش من الشاشة:
//   القطعة × الخدمة × عادي/مستعجل × السعر مجمّعة (الفاتورة المجمعة ملخصة)
// - الجاهز اللي اتفوتر بيبقى مسلَّم (العميل جه استلم)
// ============================================================

const invoiceSel = {
  ...orderSel,
  items: { orderBy: { id: "asc" }, select: itemSel },
};

// الطلبات اللي تنفع تتفوتر (للتحميل في سلة الكاشير)
// q: باركود الإيصال LO<id> | رقم يومي (مع اليوم) | جوال
export async function findOrdersToInvoice({ q, day }, user) {
  await assertModule("laundry");
  const text = q.trim();
  const where = {
    branchId: user.branch.id,
    saleId: null,
    status: { not: "cancelled" },
  };
  const barcode = /^LO(\d+)$/i.exec(text);
  if (barcode) where.id = Number(barcode[1]);
  else if (/^\d{9,11}$/.test(text)) where.phone = text;
  else if (/^\d{1,6}$/.test(text)) {
    where.dailyNo = Number(text);
    where.bizDay = dayToDbDate(day || bizToday(await settingsHour()));
  } else throw new AppError("LaundryOrderSearchInvalid");
  const rows = await prisma.laundryOrder.findMany({
    where,
    orderBy: { id: "asc" },
    take: 50,
    select: invoiceSel,
  });
  return rows.map(toOrder);
}

// طلبات بالأرقام (من شاشة الطلبات ← الكاشير)
export async function getOrdersToInvoice(ids, user) {
  await assertModule("laundry");
  const rows = await prisma.laundryOrder.findMany({
    where: {
      id: { in: ids },
      branchId: user.branch.id,
      saleId: null,
      status: { not: "cancelled" },
    },
    orderBy: { id: "asc" },
    select: invoiceSel,
  });
  return rows.map(toOrder);
}

// سطور الفاتورة من الطلبات: مجمّعة بالقطعة والخدمة والمستعجل والسعر
export async function invoiceLines(orders) {
  const productIds = [
    ...new Set(orders.flatMap((o) => o.items.map((i) => i.productId))),
  ];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, baseUnitId: true },
  });
  const unitOf = new Map(products.map((p) => [p.id, p.baseUnitId]));
  const groups = new Map();
  for (const o of orders) {
    for (const i of o.items) {
      const price = n(i.price);
      const key = `${i.productId}|${i.serviceId}|${i.isUrgent ? 1 : 0}|${price}`;
      const g = groups.get(key);
      if (g) g.qty += i.qty;
      else
        groups.set(key, {
          productId: i.productId,
          unitId: unitOf.get(i.productId),
          qty: i.qty,
          price,
          // الخدمة على السطر (بتظهر في الفاتورة تحت اسم القطعة)
          note: [
            i.serviceArName,
            i.isUrgent ? "مستعجل" : null,
          ]
            .filter(Boolean)
            .join(" - "),
        });
    }
  }
  return [...groups.values()];
}

// نص الفاتورة: أرقام الطلبات وأيامها (عشان التسليم برقم الطلب)
const ordersNote = (orders) =>
  `طلب رقم ${orders
    .map((o) => `${o.dailyNo} (${o.bizDay.split("-").reverse().join("/")})`)
    .join("، ")}`.slice(0, 500);

// بيانات فاتورة البيع للطلبات دي (اللي بتتبعت لـ createSale)
export async function laundryInvoiceData(orderIds, user) {
  const orders = await getOrdersToInvoice(orderIds, user);
  if (orders.length !== new Set(orderIds).size)
    throw new AppError("LaundryOrderInvoiced");
  const customers = new Set(orders.map((o) => o.customerId));
  if (customers.size > 1) throw new AppError("LaundryOrdersMixedCustomers");
  const items = await invoiceLines(orders);
  return {
    orders,
    customerId: orders[0].customerId,
    items,
    notes: ordersNote(orders),
    laundryPrices: items.map((i) => ({ productId: i.productId, price: i.price })),
  };
}

// ------------------------------------------------------------
// التسليم: الطلب المفوتر (مدفوع) ← مسلَّم
// (الطلب اللي ما اتفوترش بيتسلم بالفوترة من الكاشير)
// ------------------------------------------------------------
export async function deliverLaundryOrders(ids, user) {
  await assertModule("laundry");
  const { count } = await prisma.laundryOrder.updateMany({
    where: {
      id: { in: ids },
      branchId: user.branch.id,
      saleId: { not: null },
      status: { in: OPEN },
    },
    data: {
      status: "delivered",
      deliveredAt: new Date(),
      deliveredById: user.id,
    },
  });
  if (!count) throw new AppError("LaundryDeliverNotInvoiced");
  return { updated: count };
}

// حذف طلب اتعمل مع فاتورة وفشلت الفاتورة (نفس العملية من الكاشير)
export async function dropUninvoicedOrder(id) {
  await prisma.laundryOrder.deleteMany({ where: { id, saleId: null } });
}
