import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { assertModule } from "@/lib/modules";
import { runTx } from "@/lib/transaction";
import { isValidSlot, onlineSlots } from "@/lib/restaurant-slots";
import { buildRestaurantSale } from "./restaurant-pos.service";
import { nextDailyNo } from "./restaurant-link.service";
import { assertTableFree } from "./restaurant-table.service";

// ============================================================
// الطلب الأونلاين للمطعم (لينك /order/<كود الشركة>، من غير تسجيل دخول)
// - العميل: المنيو ← السلة ← الاسم والجوال والفرع وميعاد الوصول
//   وطريقة الاستلام (المحل / السيارة) ← رقم الطلب
// - الطلب بيوصل للكاشير "جديد" (pending): قبول ← مفتوح للحساب، أو رفض
// - الأسعار بتتحسب في السيرفر (نفس حساب الكاشير)، والدفع عند الاستلام
// ============================================================

const n = (v) => Number(v ?? 0);
const orderBy = [{ sortOrder: "asc" }, { id: "asc" }];
const nameSel = { id: true, arName: true, enName: true };

export async function getOnlineSettings() {
  const s = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: {
      restaurantOnline: true,
      restaurantOnlineOpen: true,
      restaurantOnlineClose: true,
      restaurantPrepMin: true,
      restaurantSlotMin: true,
      restaurantCurbside: true,
      restaurantOnlineNote: true,
      restaurantOnlineDineIn: true,
      restaurantTableMinutes: true,
    },
  });
  return {
    online: s?.restaurantOnline ?? false,
    open: s?.restaurantOnlineOpen ?? "10:00",
    close: s?.restaurantOnlineClose ?? "23:00",
    prepMin: s?.restaurantPrepMin ?? 20,
    slotMin: s?.restaurantSlotMin ?? 15,
    curbside: s?.restaurantCurbside ?? true,
    note: s?.restaurantOnlineNote ?? null,
    dineIn: s?.restaurantOnlineDineIn ?? true,
    tableMinutes: s?.restaurantTableMinutes ?? 90,
  };
}

export async function saveOnlineSettings(v) {
  await assertModule("restaurant");
  const data = {
    restaurantOnline: v.online,
    restaurantOnlineOpen: v.open,
    restaurantOnlineClose: v.close,
    restaurantPrepMin: v.prepMin,
    restaurantSlotMin: v.slotMin,
    restaurantCurbside: v.curbside,
    restaurantOnlineNote: v.note ?? null,
    restaurantOnlineDineIn: v.dineIn,
    restaurantTableMinutes: v.tableMinutes,
  };
  await prisma.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });
  return getOnlineSettings();
}

// ------------------------------------------------------------
// صفحة العميل: الشركة والفروع والمنيو والمواعيد
// ------------------------------------------------------------
export async function publicMenuInfo() {
  const settings = await getOnlineSettings();
  const [company, branches, items, sizes, groups, categories] =
    await Promise.all([
      prisma.company.findUnique({
        where: { id: 1 },
        select: { arName: true, enName: true, logo: true, phone: true },
      }),
      prisma.branch.findMany({
        where: { isActive: true },
        orderBy: { id: "asc" },
        select: { ...nameSel, address: true, phone: true },
      }),
      prisma.restaurantItem.findMany({
        where: { product: { isActive: true } },
        orderBy: [{ sortOrder: "asc" }, { productId: "asc" }],
        select: {
          productId: true,
          product: {
            select: {
              ...nameSel,
              image: true,
              price: true,
              taxRate: true,
              isPriceIncludeTax: true,
              categoryId: true,
            },
          },
          sizes: { select: { sizeId: true, price: true } },
          groups: { orderBy: { sortOrder: "asc" }, select: { groupId: true } },
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
      prisma.category.findMany({
        where: { isActive: true },
        orderBy: { arName: "asc" },
        select: nameSel,
      }),
    ]);
  const activeSizes = new Set(sizes.map((s) => s.id));
  const usedCats = new Set(items.map((i) => i.product.categoryId));
  // الأسعار للعميل بالضريبة (زي اللي هيدفعه)
  const gross = (price, p) =>
    p.isPriceIncludeTax
      ? n(price)
      : Math.round(n(price) * (1 + n(p.taxRate) / 100) * 100) / 100;
  return {
    settings: {
      online: settings.online,
      curbside: settings.curbside,
      // حجز طاولة: لو الإعداد شغال وفيه طاولات متسجلة
      dineIn:
        settings.dineIn &&
        (await prisma.restaurantTable.count({ where: { isActive: true } })) > 0,
      note: settings.note,
      open: settings.open,
      close: settings.close,
    },
    slots: settings.online ? onlineSlots(settings) : [],
    company,
    branches,
    categories: categories.filter((c) => usedCats.has(c.id)),
    sizes,
    groups: groups.map((g) => ({
      ...g,
      modifiers: g.modifiers.map((m) => ({ ...m, price: n(m.price) })),
    })),
    // الإضافات بالضريبة بنفس نسبة الصنف (بتتحسب في الصفحة)
    items: items.map((i) => ({
      productId: i.productId,
      arName: i.product.arName,
      enName: i.product.enName,
      image: i.product.image,
      categoryId: i.product.categoryId,
      taxRate: i.product.isPriceIncludeTax ? 0 : n(i.product.taxRate),
      price: gross(i.product.price, i.product),
      sizes: i.sizes
        .filter((s) => activeSizes.has(s.sizeId))
        .map((s) => ({ sizeId: s.sizeId, price: gross(s.price, i.product) })),
      groupIds: i.groups.map((g) => g.groupId),
    })),
  };
}

// ------------------------------------------------------------
// العميل بيبعت الطلب
// ------------------------------------------------------------
export async function publicCreateOrder(d) {
  await assertModule("restaurant");
  const settings = await getOnlineSettings();
  if (!settings.online) throw new AppError("RestaurantOnlineOff");
  const branch = await prisma.branch.findFirst({
    where: { id: d.branchId, isActive: true },
    select: { id: true, arName: true, enName: true },
  });
  if (!branch) throw new AppError("BranchNotFound");
  if (!isValidSlot(settings, d.pickupAt)) throw new AppError("RestaurantSlotTaken");
  // في المحل: طاولة فاضية في الميعاد وتكفي عدد الأفراد
  const dineIn = d.orderMode === "dinein";
  let table = null;
  if (dineIn) {
    if (!settings.dineIn) throw new AppError("RestaurantDineInOff");
    if (!d.tableId || !d.partySize) throw new AppError("RestaurantTableRequired");
    table = await assertTableFree({
      branchId: branch.id,
      tableId: d.tableId,
      at: d.pickupAt,
      partySize: d.partySize,
    });
  }

  // الأسعار والتحقق من الأحجام والإضافات (نفس حساب الكاشير)
  const built = await buildRestaurantSale(
    {
      orderType: "takeaway",
      lines: d.lines,
      servicePercent: 0,
      deliveryFee: 0,
    },
    { branch: { id: branch.id } },
  );
  const order = await runTx(async (tx) => {
    const no = await nextDailyNo(tx, branch.id);
    return tx.restaurantOrder.create({
      data: {
        branchId: branch.id,
        ...no,
        orderType: dineIn ? "dinein" : "takeaway",
        tableId: table?.id ?? null,
        tableNo: table?.name ?? null,
        partySize: dineIn ? d.partySize : null,
        status: "pending",
        source: "online",
        customerName: d.customerName,
        phone: d.phone,
        pickupAt: new Date(d.pickupAt),
        pickupMode: dineIn ? "store" : "car",
        carInfo: null,
        notes: d.notes ?? null,
        orderLines: d.lines,
        total: built.estimatedTotal,
      },
      select: { dailyNo: true, pickupAt: true, total: true },
    });
  });
  return {
    table: table ? { name: table.name, partySize: d.partySize } : null,
    dailyNo: order.dailyNo,
    pickupAt: order.pickupAt,
    total: n(order.total),
    branch,
  };
}
