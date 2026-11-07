import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { assertModule } from "@/lib/modules";
import { runTx } from "@/lib/transaction";

// ============================================================
// المغسلة (وحدة laundry) - المرحلة الأولى: الأصناف والخدمات والإضافات
// - القطعة (ثوب، شماغ...) = صنف خدمة عادي (عشان تنزل في الفاتورة وZATCA)
//   + سطر في laundry_items (صنف مغسلة)
// - السعر = القطعة × الخدمة: عادي + مستعجل (المستعجل null = مش متاح)
//   السطر مش موجود = الخدمة مش متاحة للقطعة دي
// - الإضافات (نشا، مرزام، علّاق...) من غير أسعار، في مجموعات:
//   multiple = يختار أكتر من واحدة، غير كده واحدة بس (زي النشا)
// ============================================================

const orderBy = [{ sortOrder: "asc" }, { id: "asc" }];
const nameSel = { id: true, arName: true, enName: true };
const priceSel = { serviceId: true, price: true, urgentPrice: true };

const toPrice = (p) => ({
  serviceId: p.serviceId,
  price: Number(p.price),
  urgentPrice: p.urgentPrice == null ? null : Number(p.urgentPrice),
});

// الاسم مكرر (قاعدة البيانات رفضت بـ P2002) ← رسالة على الحقل
function handleUnique(error, code) {
  if (error?.code === "P2002") {
    const target = String(error.meta?.target ?? "");
    const field = target.includes("enName") ? "enName" : "arName";
    throw new AppError(code, null, { [field]: code });
  }
  throw error;
}

function handleMissing(error, code) {
  if (error?.code === "P2025") throw new AppError(code);
  throw error;
}

// ------------------------------------------------------------
// شاشة المغسلة: كل البيانات مرة واحدة
// ------------------------------------------------------------
export async function getLaundryCatalog() {
  await assertModule("laundry");
  const [services, groups, items] = await Promise.all([
    prisma.laundryService.findMany({
      orderBy,
      select: {
        ...nameSel,
        sortOrder: true,
        isActive: true,
        _count: { select: { prices: true } },
      },
    }),
    prisma.laundryAddonGroup.findMany({
      orderBy,
      select: {
        ...nameSel,
        multiple: true,
        sortOrder: true,
        isActive: true,
        addons: {
          orderBy,
          select: { ...nameSel, groupId: true, sortOrder: true, isActive: true },
        },
      },
    }),
    prisma.laundryItem.findMany({
      orderBy: [{ sortOrder: "asc" }, { productId: "asc" }],
      select: {
        productId: true,
        sortOrder: true,
        product: {
          select: {
            ...nameSel,
            code: true,
            image: true,
            isActive: true,
          },
        },
        prices: { select: priceSel },
      },
    }),
  ]);
  return {
    services,
    groups,
    items: items.map((i) => ({
      productId: i.productId,
      sortOrder: i.sortOrder,
      product: i.product,
      prices: i.prices.map(toPrice),
    })),
  };
}

// ------------------------------------------------------------
// الخدمات
// ------------------------------------------------------------
export async function createLaundryService(data) {
  await assertModule("laundry");
  return prisma.laundryService
    .create({ data, select: { id: true } })
    .catch((e) => handleUnique(e, "LaundryServiceExists"));
}

export async function updateLaundryService({ id, ...data }) {
  await assertModule("laundry");
  return prisma.laundryService
    .update({ where: { id }, data, select: { id: true } })
    .catch((e) =>
      e?.code === "P2025"
        ? handleMissing(e, "LaundryServiceNotFound")
        : handleUnique(e, "LaundryServiceExists"),
    );
}

// الحذف بيمسح أسعار الخدمة دي من كل القطع (الأفضل الإيقاف لو هترجع لها)
export async function deleteLaundryService(id) {
  await assertModule("laundry");
  await prisma.laundryService
    .delete({ where: { id } })
    .catch((e) => handleMissing(e, "LaundryServiceNotFound"));
  return { id };
}

// ------------------------------------------------------------
// مجموعات الإضافات
// ------------------------------------------------------------
export async function createLaundryAddonGroup(data) {
  await assertModule("laundry");
  return prisma.laundryAddonGroup
    .create({ data, select: { id: true } })
    .catch((e) => handleUnique(e, "LaundryAddonGroupExists"));
}

export async function updateLaundryAddonGroup({ id, ...data }) {
  await assertModule("laundry");
  return prisma.laundryAddonGroup
    .update({ where: { id }, data, select: { id: true } })
    .catch((e) =>
      e?.code === "P2025"
        ? handleMissing(e, "LaundryAddonGroupNotFound")
        : handleUnique(e, "LaundryAddonGroupExists"),
    );
}

// المجموعة اللي فيها إضافات ما تتمسحش (تتمسح إضافاتها الأول)
export async function deleteLaundryAddonGroup(id) {
  await assertModule("laundry");
  const used = await prisma.laundryAddon.count({ where: { groupId: id } });
  if (used) throw new AppError("LaundryAddonGroupInUse");
  await prisma.laundryAddonGroup
    .delete({ where: { id } })
    .catch((e) => handleMissing(e, "LaundryAddonGroupNotFound"));
  return { id };
}

// ------------------------------------------------------------
// الإضافات
// ------------------------------------------------------------
async function assertGroup(groupId) {
  const g = await prisma.laundryAddonGroup.findUnique({
    where: { id: groupId },
    select: { id: true },
  });
  if (!g)
    throw new AppError("LaundryAddonGroupNotFound", null, {
      groupId: "LaundryAddonGroupNotFound",
    });
}

export async function createLaundryAddon(data) {
  await assertModule("laundry");
  await assertGroup(data.groupId);
  return prisma.laundryAddon
    .create({ data, select: { id: true } })
    .catch((e) => handleUnique(e, "LaundryAddonExists"));
}

export async function updateLaundryAddon({ id, ...data }) {
  await assertModule("laundry");
  await assertGroup(data.groupId);
  return prisma.laundryAddon
    .update({ where: { id }, data, select: { id: true } })
    .catch((e) =>
      e?.code === "P2025"
        ? handleMissing(e, "LaundryAddonNotFound")
        : handleUnique(e, "LaundryAddonExists"),
    );
}

export async function deleteLaundryAddon(id) {
  await assertModule("laundry");
  await prisma.laundryAddon
    .delete({ where: { id } })
    .catch((e) => handleMissing(e, "LaundryAddonNotFound"));
  return { id };
}

// ------------------------------------------------------------
// أسعار القطع
// ------------------------------------------------------------

// خدمة واحدة مرة واحدة بس، وكل الخدمات لازم تكون موجودة
async function assertServices(rows) {
  const ids = rows.flatMap((r) => r.prices.map((p) => p.serviceId));
  const unique = [...new Set(ids)];
  for (const r of rows) {
    const seen = new Set();
    for (const p of r.prices) {
      if (seen.has(p.serviceId)) throw new AppError("LaundryDuplicateService");
      seen.add(p.serviceId);
    }
  }
  if (!unique.length) return;
  const found = await prisma.laundryService.count({
    where: { id: { in: unique } },
  });
  if (found !== unique.length) throw new AppError("LaundryServiceNotFound");
}

// يستبدل أسعار القطعة بالقائمة الجديدة (جوه transaction)
async function replacePrices(tx, productId, prices) {
  const keep = prices.map((p) => p.serviceId);
  await tx.laundryPrice.deleteMany({
    where: { productId, ...(keep.length ? { serviceId: { notIn: keep } } : {}) },
  });
  for (const p of prices) {
    await tx.laundryPrice.upsert({
      where: { productId_serviceId: { productId, serviceId: p.serviceId } },
      create: { productId, ...p },
      update: { price: p.price, urgentPrice: p.urgentPrice },
    });
  }
}

// فورم الصنف: هل الصنف قطعة مغسلة؟ وأسعاره
// الخدمات: المفعّلة + الموقوفة اللي ليها سعر على القطعة دي
// (عشان الحفظ بيستبدل كل الأسعار، فالموقوفة لازم تظهر وما تضيعش)
export async function getLaundryItem(productId) {
  await assertModule("laundry");
  const [item, services] = await Promise.all([
    prisma.laundryItem.findUnique({
      where: { productId },
      select: { sortOrder: true, prices: { select: priceSel } },
    }),
    prisma.laundryService.findMany({
      where: {
        OR: [{ isActive: true }, { prices: { some: { productId } } }],
      },
      orderBy,
      select: { ...nameSel, isActive: true },
    }),
  ]);
  return {
    services,
    laundryItem: Boolean(item),
    sortOrder: item?.sortOrder ?? 0,
    prices: (item?.prices ?? []).map(toPrice),
  };
}

// فورم الصنف: الخدمات المتاحة (للإضافة، قبل ما الصنف يتحفظ)
export async function getActiveLaundryServices() {
  await assertModule("laundry");
  return prisma.laundryService.findMany({
    where: { isActive: true },
    orderBy,
    select: nameSel,
  });
}

// فورم الصنف (بعد حفظ الصنف): صنف مغسلة ولا لأ + أسعاره
// القطعة لازم تكون خدمة (مالهاش مخزون)
export async function saveLaundryItem({
  productId,
  laundryItem,
  sortOrder,
  prices,
}) {
  await assertModule("laundry");
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, isService: true },
  });
  if (!product) throw new AppError("ProductNotFound");
  if (!laundryItem) {
    // مش صنف مغسلة: السطر وأسعاره بيتمسحوا (لو موجودين)
    await prisma.laundryItem.deleteMany({ where: { productId } });
    return { productId, laundryItem: false };
  }
  if (!product.isService) throw new AppError("LaundryItemMustBeService");
  await assertServices([{ productId, prices }]);
  await runTx(async (tx) => {
    await tx.laundryItem.upsert({
      where: { productId },
      create: { productId, sortOrder },
      update: { sortOrder },
    });
    await replacePrices(tx, productId, prices);
  });
  return { productId, laundryItem: true };
}

// جدول الأسعار (تعديل جماعي): القطع اللي اتغيّرت بس، كلها مرة واحدة
export async function saveLaundryPrices(rows) {
  await assertModule("laundry");
  const ids = [...new Set(rows.map((r) => r.productId))];
  if (ids.length !== rows.length) throw new AppError("LaundryDuplicateItem");
  const found = await prisma.laundryItem.count({
    where: { productId: { in: ids } },
  });
  if (found !== ids.length) throw new AppError("LaundryItemNotFound");
  await assertServices(rows);
  await runTx(async (tx) => {
    for (const r of rows) await replacePrices(tx, r.productId, r.prices);
  });
  return { saved: rows.length };
}
