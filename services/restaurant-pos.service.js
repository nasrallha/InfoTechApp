import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { assertModule } from "@/lib/modules";
import { runTx } from "@/lib/transaction";
import { dbDateToDay } from "@/lib/dates";
import {
  feeLinePrice,
  lineGross,
  linePrice,
  lineNote,
  piecesText,
  restaurantFees,
} from "@/lib/restaurant-calc";
import {
  getBranchSaleContext,
  inBranch,
  saleProductSelect,
  toSaleProduct,
} from "./sale-catalog.service";
import { ensureFeeProducts, getRestaurantSettings } from "./restaurant.service";
import { nextDailyNo, orderFields } from "./restaurant-link.service";
import { branchPrinters } from "./restaurant-printer.service";
import { branchTables } from "./restaurant-table.service";

// ============================================================
// كاشير المطعم
// - المنيو بشكل أصناف الكاشير (عشان السلة والضريبة زي أي صنف) + أحجامه وإضافاته
// - السيرفر بيحسب أسعار السطور والرسوم من جديد (الشاشة ما تقدرش تبعت أسعار)
// - الطاولة المفتوحة: طلب من غير فاتورة (سطوره في lines) لحد الحساب
// ============================================================

const n = (v) => Number(v ?? 0);
const orderBy = [{ sortOrder: "asc" }, { id: "asc" }];
const nameSel = { id: true, arName: true, enName: true };

export async function getRestaurantPosCatalog(user) {
  await assertModule("restaurant");
  // أصناف الرسوم لازم تكون موجودة قبل الكاشير (سطور الخدمة / التوصيل / التبغ)
  await ensureFeeProducts();
  const ctx = await getBranchSaleContext(user.branch.id);
  const [items, sizes, groups, channels, drivers, settings, printers, tables] =
    await Promise.all([
    prisma.restaurantItem.findMany({
      // منيو الفرع: الأصناف المتاحة في مستودعه بس
      where: { product: inBranch(ctx, { isActive: true }) },
      orderBy: [{ sortOrder: "asc" }, { productId: "asc" }],
      select: {
        productId: true,
        isTobacco: true,
        askPieces: true,
        product: { select: saleProductSelect(ctx) },
        sizes: { select: { sizeId: true, price: true } },
        groups: { orderBy: { sortOrder: "asc" }, select: { groupId: true } },
        channelPrices: {
          select: { channelId: true, sizeId: true, price: true },
        },
      },
    }),
    prisma.restaurantSize.findMany({
      where: { isActive: true },
      orderBy,
      select: nameSel,
    }),
    prisma.restaurantModifierGroup.findMany({
      where: { isActive: true },
      orderBy,
      select: {
        ...nameSel,
        minSelect: true,
        maxSelect: true,
        modifiers: {
          where: { isActive: true },
          orderBy,
          select: { ...nameSel, price: true },
        },
      },
    }),
    prisma.salesChannel.findMany({
      where: { isActive: true },
      orderBy,
      select: { ...nameSel, markupType: true, markupValue: true },
    }),
    prisma.restaurantDriver.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
    }),
    getRestaurantSettings(),
    // طابعات الفرع (تقسيم تذكرة التحضير)
    branchPrinters(user.branch.id),
    // طاولات الفرع (والمشغول منها دلوقتي)
    branchTables(user.branch.id),
  ]);

  // الطاولة الافتراضية: لو من فرع تاني ← الطاولة اللي بنفس الاسم في الفرع ده
  let defaultTableId = settings.defaultTableId;
  if (defaultTableId && !tables.some((x) => x.id === defaultTableId)) {
    const def = await prisma.restaurantTable.findUnique({
      where: { id: defaultTableId },
      select: { name: true },
    });
    defaultTableId = tables.find((x) => x.name === def?.name)?.id ?? null;
  }

  // أصناف الرسوم بشكل أصناف الكاشير (سطور الفاتورة)
  const feeIds = Object.values(settings.feeProducts).filter(Boolean);
  const feeRows = feeIds.length
    ? await prisma.product.findMany({
        where: { id: { in: feeIds } },
        select: saleProductSelect(ctx),
      })
    : [];
  const feeById = new Map(feeRows.map((p) => [p.id, toSaleProduct(p)]));
  const fee = (id) => (id ? (feeById.get(id) ?? null) : null);

  const activeSizes = new Set(sizes.map((s) => s.id));
  return {
    items: items.map((i) => {
      const product = toSaleProduct(i.product);
      return {
        productId: i.productId,
        isTobacco: i.isTobacco,
        askPieces: i.askPieces,
        categoryId: product.categoryId ?? i.product.categoryId ?? null,
        product,
        price: product.units[0].price,
        sizes: i.sizes
          .filter((s) => activeSizes.has(s.sizeId))
          .map((s) => ({ sizeId: s.sizeId, price: n(s.price) })),
        groupIds: i.groups.map((g) => g.groupId),
        channelPrices: i.channelPrices.map((p) => ({
          channelId: p.channelId,
          sizeId: p.sizeId,
          price: n(p.price),
        })),
      };
    }),
    sizes,
    groups: groups.map((g) => ({
      ...g,
      modifiers: g.modifiers.map((m) => ({ ...m, price: n(m.price) })),
    })),
    channels: channels.map((c) => ({ ...c, markupValue: n(c.markupValue) })),
    drivers,
    printers,
    tables,
    settings: {
      serviceType: settings.serviceType,
      servicePercent: settings.servicePercent,
      tobaccoType: settings.tobaccoType,
      defaultOrderType: settings.defaultOrderType,
      defaultTableId,
      serviceDineInOnly: settings.serviceDineInOnly,
      deliveryFee: settings.deliveryFee,
      tobaccoPercent: settings.tobaccoPercent,
    },
    fees: {
      service: fee(settings.feeProducts.service),
      delivery: fee(settings.feeProducts.delivery),
      tobacco: fee(settings.feeProducts.tobacco),
    },
  };
}

// ------------------------------------------------------------
// سطور الفاتورة من سطور الكاشير (الأسعار والرسوم من السيرفر)
// lines: [{ productId, sizeId, modifierIds, qty, notes, discountType, discountValue }]
// ------------------------------------------------------------
export async function buildRestaurantSale(d, user) {
  await assertModule("restaurant");
  const ctx = await getBranchSaleContext(user.branch.id);
  const productIds = [...new Set(d.lines.map((l) => l.productId))];
  const [items, sizes, groups, channel, settings] = await Promise.all([
    prisma.restaurantItem.findMany({
      where: { productId: { in: productIds } },
      select: {
        productId: true,
        isTobacco: true,
        askPieces: true,
        product: { select: saleProductSelect(ctx) },
        sizes: { select: { sizeId: true, price: true } },
        groups: { select: { groupId: true } },
        channelPrices: {
          select: { channelId: true, sizeId: true, price: true },
        },
      },
    }),
    prisma.restaurantSize.findMany({ select: nameSel }),
    prisma.restaurantModifierGroup.findMany({
      select: {
        id: true,
        minSelect: true,
        maxSelect: true,
        modifiers: { select: { ...nameSel, price: true, isActive: true } },
      },
    }),
    d.orderType === "app" && d.channelId
      ? prisma.salesChannel.findFirst({
          where: { id: d.channelId, isActive: true },
          select: { id: true, markupType: true, markupValue: true },
        })
      : null,
    getRestaurantSettings(),
  ]);
  if (d.orderType === "app" && !channel)
    throw new AppError("RestaurantChannelRequired");
  if (d.orderType === "delivery" && d.driverId) {
    const ok = await prisma.restaurantDriver.count({
      where: { id: d.driverId },
    });
    if (!ok) throw new AppError("RestaurantDriverNotFound");
  }
  const itemById = new Map(items.map((i) => [i.productId, i]));
  const sizeById = new Map(sizes.map((s) => [s.id, s]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const ch = channel
    ? { ...channel, markupValue: n(channel.markupValue) }
    : null;

  const saleItems = [];
  const priced = [];
  const feeBase = [];
  // الإجمالي التقريبي بالضريبة (للطلب الأونلاين قبل الفاتورة)
  let estimated = 0;
  const withTax = (amount, rate, inclusive) =>
    inclusive ? amount : amount * (1 + (Number(rate) || 0) / 100);
  for (const l of d.lines) {
    const it = itemById.get(l.productId);
    if (!it) throw new AppError("RestaurantItemNotFound");
    const product = toSaleProduct(it.product);
    const unit = product.units[0];
    const item = {
      price: unit.price,
      sizes: it.sizes.map((s) => ({ sizeId: s.sizeId, price: n(s.price) })),
      channelPrices: it.channelPrices.map((p) => ({
        channelId: p.channelId,
        sizeId: p.sizeId,
        price: n(p.price),
      })),
    };
    // الحجم: لازم لو الصنف ليه أحجام، ومن أحجامه
    const sizeId = l.sizeId || 0;
    if (item.sizes.length && !item.sizes.some((s) => s.sizeId === sizeId))
      throw new AppError("RestaurantSizeRequired", [product]);
    if (!item.sizes.length && sizeId) throw new AppError("RestaurantSizeNotFound");
    // الإضافات: من مجموعات الصنف، وبحدود كل مجموعة
    const mods = [];
    const perGroup = new Map();
    const itemGroups = new Set(it.groups.map((g) => g.groupId));
    for (const mid of new Set(l.modifierIds)) {
      let found = null;
      for (const gid of itemGroups) {
        const m = groupById.get(gid)?.modifiers.find((x) => x.id === mid);
        if (m) {
          found = { ...m, groupId: gid };
          break;
        }
      }
      if (!found) throw new AppError("RestaurantModifierNotFound");
      mods.push(found);
      perGroup.set(found.groupId, (perGroup.get(found.groupId) ?? 0) + 1);
    }
    for (const gid of itemGroups) {
      const g = groupById.get(gid);
      const c = perGroup.get(gid) ?? 0;
      const activeCount = g.modifiers.filter((m) => m.isActive).length;
      if (c < Math.min(g.minSelect, activeCount) || (g.maxSelect && c > g.maxSelect))
        throw new AppError("RestaurantModifiersInvalid", [product]);
    }
    const price = linePrice(
      item,
      sizeId,
      mods.map((m) => ({ price: n(m.price) })),
      ch,
    );
    // الكمية بكسور للأصناف بالوزن بس (السمك)، والباقي أرقام صحيحة (الشيشة...)
    if (!it.askPieces && !Number.isInteger(l.qty))
      throw new AppError("RestaurantQtyWhole", [product]);
    // عدد الحبات (السمك...) أول الوصف عشان التحضير
    const pieces = it.askPieces && l.pieces ? piecesText(l.pieces) : null;
    const note = lineNote(
      [pieces, sizeId ? sizeById.get(sizeId)?.arName : null]
        .filter(Boolean)
        .join(" · ") || null,
      mods.map((m) => m.arName),
      l.notes,
    );
    saleItems.push({
      productId: product.id,
      unitId: unit.unit.id,
      qty: l.qty,
      price,
      discountType: l.discountType ?? "amount",
      discountValue: l.discountValue ?? 0,
      note: note || null,
    });
    priced.push({ productId: product.id, price });
    estimated += withTax(price * l.qty, product.taxRate, product.priceIncludesTax);
    const discount =
      l.discountType === "percent"
        ? (price * l.qty * (l.discountValue ?? 0)) / 100
        : (l.discountValue ?? 0);
    feeBase.push({
      amount: lineGross({
        price,
        qty: l.qty,
        taxRate: product.taxRate,
        inclusive: product.priceIncludesTax,
        discount,
      }),
      qty: l.qty,
      isTobacco: it.isTobacco,
    });
  }

  // الرسوم: سطور بأصناف الرسوم (السعر من غير ضريبة)
  const fees = restaurantFees(feeBase, {
    orderType: d.orderType,
    // نوع الخدمة من الإعدادات، والقيمة من الكاشير (بيغيّرها في الفاتورة)
    serviceType: settings.serviceType,
    servicePercent: d.servicePercent,
    serviceDineInOnly: settings.serviceDineInOnly,
    deliveryFee: d.deliveryFee,
    tobaccoType: settings.tobaccoType,
    tobaccoPercent: settings.tobaccoPercent,
  });
  const feeProductIds = settings.feeProducts;
  for (const kind of ["tobacco", "service", "delivery"]) {
    const amount = fees[kind];
    if (!(amount > 0)) continue;
    const pid = feeProductIds[kind];
    if (!pid) throw new AppError("RestaurantFeeProductMissing");
    const p = await prisma.product.findUnique({
      where: { id: pid },
      select: saleProductSelect(ctx),
    });
    if (!p) throw new AppError("RestaurantFeeProductMissing");
    const fp = toSaleProduct(p);
    // المبلغ الشامل ← سعر من غير ضريبة (صنف الرسوم سعره من غير ضريبة)
    const price = feeLinePrice(amount, fees.inclusive[kind], fp.taxRate);
    saleItems.push({
      productId: fp.id,
      unitId: fp.units[0].unit.id,
      qty: 1,
      price,
      discountType: "amount",
      discountValue: 0,
      note: null,
    });
    priced.push({ productId: fp.id, price });
    estimated += withTax(price, fp.taxRate, fp.priceIncludesTax);
  }
  return {
    items: saleItems,
    restaurantPrices: priced,
    // أصناف الرسوم: بره خصم الفاتورة
    feeProductIds: Object.values(feeProductIds).filter(Boolean),
    fees,
    estimatedTotal: Math.round(estimated * 100) / 100,
  };
}

// ------------------------------------------------------------
// الطاولات المفتوحة (الصالة): حفظ الطلب من غير فاتورة
// ------------------------------------------------------------
// الكاشير شغال على الورديات: الطاولة زي الفاتورة لازم وردية مفتوحة على نفس الفرع
async function assertOpenShift(user) {
  const shift = await prisma.shift.findFirst({
    where: { userId: user.id, status: "open" },
    select: { branchId: true },
  });
  if (!shift) throw new AppError("ShiftRequired");
  if (shift.branchId !== user.branch.id) throw new AppError("ShiftOtherBranch");
}

export async function saveOpenOrder(d, user) {
  await assertModule("restaurant");
  await assertOpenShift(user);
  // التحقق من السطور والأسعار (نفس حساب الفاتورة)
  const built = await buildRestaurantSale(d, user);
  const total = built.items.reduce((s, i) => s + i.price * i.qty, 0);
  const data = {
    ...orderFields(d),
    orderLines: d.lines,
    total: Math.round(total * 100) / 100,
  };
  if (d.orderId) {
    const { count } = await prisma.restaurantOrder.updateMany({
      where: { id: d.orderId, status: "open", branchId: user.branch.id },
      data,
    });
    if (!count) throw new AppError("RestaurantOrderNotOpen");
    return getOrder(d.orderId);
  }
  const order = await runTx(async (tx) => {
    const no = await nextDailyNo(tx, user.branch.id);
    return tx.restaurantOrder.create({
      data: {
        ...data,
        status: "open",
        branchId: user.branch.id,
        ...no,
        createdById: user.id,
      },
      select: { id: true },
    });
  });
  return getOrder(order.id);
}

const orderSelect = {
  id: true,
  dailyNo: true,
  bizDay: true,
  orderType: true,
  status: true,
  tableNo: true,
  tableId: true,
  partySize: true,
  channelId: true,
  channelOrderNo: true,
  driverId: true,
  customerId: true,
  customerName: true,
  phone: true,
  address: true,
  deliveryFee: true,
  serviceType: true,
  servicePercent: true,
  orderLines: true,
  total: true,
  saleId: true,
  createdAt: true,
  source: true,
  pickupAt: true,
  pickupMode: true,
  carInfo: true,
  notes: true,
  channel: { select: nameSel },
  driver: { select: { id: true, name: true } },
};
const toOrder = (o) => ({
  ...o,
  bizDay: dbDateToDay(o.bizDay),
  deliveryFee: n(o.deliveryFee),
  servicePercent: n(o.servicePercent),
  total: n(o.total),
  orderLines: undefined,
  lines: Array.isArray(o.orderLines) ? o.orderLines : [],
});

async function getOrder(id) {
  const o = await prisma.restaurantOrder.findUnique({
    where: { id },
    select: orderSelect,
  });
  return o ? toOrder(o) : null;
}

// طلبات اليوم في الفرع (المفتوحة الأول) + البحث برقم الطلب / الطاولة
export async function listTodayOrders({ q }, user) {
  await assertModule("restaurant");
  const since = new Date(Date.now() - 36 * 3600 * 1000);
  const text = (q ?? "").trim();
  const rows = await prisma.restaurantOrder.findMany({
    where: {
      branchId: user.branch.id,
      ...(text
        ? /^\d+$/.test(text)
          ? { OR: [{ dailyNo: Number(text) }, { tableNo: text }] }
          : { OR: [{ tableNo: text }, { customerName: { contains: text } }] }
        : {
            OR: [
              { status: { in: ["open", "pending"] } },
              { createdAt: { gte: since } },
            ],
          }),
    },
    orderBy: { id: "desc" },
    take: 100,
    select: orderSelect,
  });
  // الأونلاين الجديد الأول، بعده المفتوح، بعده الباقي
  const rank = { pending: 0, open: 1 };
  return rows
    .map(toOrder)
    .sort((a, b) => (rank[a.status] ?? 2) - (rank[b.status] ?? 2));
}

export async function cancelOpenOrder(id, user) {
  await assertModule("restaurant");
  await assertOpenShift(user);
  const { count } = await prisma.restaurantOrder.updateMany({
    where: { id, status: "open", branchId: user.branch.id },
    data: { status: "cancelled" },
  });
  if (!count) throw new AppError("RestaurantOrderNotOpen");
  return { id };
}

// ------------------------------------------------------------
// الطلب الأونلاين عند الكاشير: قبول (يبقى مفتوح للحساب) / رفض + عدد الجديد
// ------------------------------------------------------------
export async function acceptOnlineOrder(id, user) {
  await assertModule("restaurant");
  await assertOpenShift(user);
  const { count } = await prisma.restaurantOrder.updateMany({
    where: { id, status: "pending", branchId: user.branch.id },
    data: { status: "open" },
  });
  if (!count) throw new AppError("RestaurantOrderNotPending");
  return getOrder(id);
}

export async function rejectOnlineOrder(id, user) {
  await assertModule("restaurant");
  const { count } = await prisma.restaurantOrder.updateMany({
    where: { id, status: "pending", branchId: user.branch.id },
    data: { status: "cancelled" },
  });
  if (!count) throw new AppError("RestaurantOrderNotPending");
  return { id };
}

// العداد على زرار الطلبات: الطلبات اللي لسه مخلصتش في الفرع
// pending: أونلاين جديد لسه ماتقبلش (التنبيه) | open: مفتوح لسه ماتحاسبش
export async function pendingOnlineCount(user) {
  await assertModule("restaurant");
  const rows = await prisma.restaurantOrder.groupBy({
    by: ["status"],
    where: { status: { in: ["pending", "open"] }, branchId: user.branch.id },
    _count: { _all: true },
  });
  const n = (s) => rows.find((r) => r.status === s)?._count._all ?? 0;
  return { pending: n("pending"), open: n("open") };
}
