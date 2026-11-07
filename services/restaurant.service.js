import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { assertModule } from "@/lib/modules";
import { runTx } from "@/lib/transaction";
import { saveImage, deleteImage } from "@/lib/upload";
import {
  assertUniqueName,
  createProduct,
  dropImage,
  findOrCreate,
  nextProductCode,
} from "./product.service";

// ============================================================
// المطعم / المقهى (وحدة restaurant) - المرحلة 1-أ: المنيو
// - صنف المنيو = صنف عادي + سطر في restaurant_items (ترتيبه + رسوم التبغ)
// - الأحجام: سعر لكل حجم (الصنف من غير أحجام = سعره العادي)
// - الإضافات: مجموعات بحد أدنى/أقصى، مربوطة بالأصناف، وكل إضافة بسعرها
// - التطبيقات: من لوحة التحكم (هنا أسعار الأصناف فيها بس)
// - السائقين + الإعدادات (رسوم الخدمة والتوصيل والتبغ)
// ============================================================

const orderBy = [{ sortOrder: "asc" }, { id: "asc" }];
const nameSel = { id: true, arName: true, enName: true };
const n = (v) => Number(v ?? 0);

// الاسم مكرر (P2002) ← رسالة على الحقل
function handleUnique(error, code) {
  if (error?.code === "P2002") {
    const target = String(error.meta?.target ?? "");
    const field = target.includes("enName")
      ? "enName"
      : target.includes("name") && !target.includes("arName")
        ? "name"
        : "arName";
    throw new AppError(code, null, { [field]: code });
  }
  throw error;
}
const handleMissing = (code) => (error) => {
  if (error?.code === "P2025") throw new AppError(code);
  throw error;
};
const saveError = (missing, exists) => (e) =>
  e?.code === "P2025" ? handleMissing(missing)(e) : handleUnique(e, exists);

// ------------------------------------------------------------
// شاشة المطعم: كل البيانات مرة واحدة
// ------------------------------------------------------------
export async function getRestaurantCatalog() {
  await assertModule("restaurant");
  const [sizes, groups, channels, drivers, items, settings, categories] =
    await Promise.all([
      prisma.restaurantSize.findMany({
        orderBy,
        select: { ...nameSel, sortOrder: true, isActive: true },
      }),
      prisma.restaurantModifierGroup.findMany({
        orderBy,
        select: {
          ...nameSel,
          minSelect: true,
          maxSelect: true,
          sortOrder: true,
          isActive: true,
          modifiers: {
            orderBy,
            select: {
              ...nameSel,
              groupId: true,
              price: true,
              sortOrder: true,
              isActive: true,
            },
          },
          _count: { select: { items: true } },
        },
      }),
      prisma.salesChannel.findMany({
        orderBy,
        select: {
          ...nameSel,
          markupType: true,
          markupValue: true,
          commissionPercent: true,
          isActive: true,
        },
      }),
      prisma.restaurantDriver.findMany({
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          phone: true,
          commissionType: true,
          commissionValue: true,
          isActive: true,
        },
      }),
      prisma.restaurantItem.findMany({
        orderBy: [{ sortOrder: "asc" }, { productId: "asc" }],
        select: {
          productId: true,
          sortOrder: true,
          isTobacco: true,
          askPieces: true,
          product: {
            select: {
              ...nameSel,
              code: true,
              image: true,
              price: true,
              isActive: true,
              isService: true,
              isPriceIncludeTax: true,
              categoryId: true,
              category: { select: nameSel },
            },
          },
          sizes: { select: { sizeId: true, price: true } },
          groups: {
            orderBy: { sortOrder: "asc" },
            select: { groupId: true },
          },
          channelPrices: {
            select: { channelId: true, sizeId: true, price: true },
          },
        },
      }),
      getRestaurantSettings(),
      prisma.category.findMany({
        where: { isActive: true },
        orderBy: { arName: "asc" },
        select: nameSel,
      }),
    ]);
  return {
    sizes,
    groups: groups.map(({ _count, modifiers, ...g }) => ({
      ...g,
      items: _count.items,
      modifiers: modifiers.map((m) => ({ ...m, price: n(m.price) })),
    })),
    channels: channels.map((c) => ({
      ...c,
      markupValue: n(c.markupValue),
      commissionPercent: n(c.commissionPercent),
    })),
    drivers: drivers.map((d) => ({
      ...d,
      commissionValue: n(d.commissionValue),
    })),
    items: items.map((i) => ({
      productId: i.productId,
      sortOrder: i.sortOrder,
      isTobacco: i.isTobacco,
      askPieces: i.askPieces,
      product: { ...i.product, price: n(i.product.price) },
      sizes: i.sizes.map((s) => ({ sizeId: s.sizeId, price: n(s.price) })),
      groupIds: i.groups.map((g) => g.groupId),
      channelPrices: i.channelPrices.map((p) => ({
        channelId: p.channelId,
        sizeId: p.sizeId,
        price: n(p.price),
      })),
    })),
    settings,
    categories,
    // الصنف الجديد: السعر شامل الضريبة ولا لأ (الافتراضي من إعدادات البرنامج)
    priceIncludesTaxDefault: Boolean(
      (
        await prisma.systemSettings.findUnique({
          where: { id: 1 },
          select: { productPriceIncludesTax: true },
        })
      )?.productPriceIncludesTax,
    ),
  };
}

// ------------------------------------------------------------
// الأحجام
// ------------------------------------------------------------
export async function createRestaurantSize(data) {
  await assertModule("restaurant");
  return prisma.restaurantSize
    .create({ data, select: { id: true } })
    .catch((e) => handleUnique(e, "RestaurantSizeExists"));
}

export async function updateRestaurantSize({ id, ...data }) {
  await assertModule("restaurant");
  return prisma.restaurantSize
    .update({ where: { id }, data, select: { id: true } })
    .catch(saveError("RestaurantSizeNotFound", "RestaurantSizeExists"));
}

// الحجم اللي عليه أسعار أصناف مايتمسحش (يتوقف بدل كده)
export async function deleteRestaurantSize(id) {
  await assertModule("restaurant");
  const used = await prisma.restaurantItemSize.count({ where: { sizeId: id } });
  if (used) throw new AppError("RestaurantSizeInUse");
  await prisma.restaurantSize
    .delete({ where: { id } })
    .catch(handleMissing("RestaurantSizeNotFound"));
  return { id };
}

// ------------------------------------------------------------
// مجموعات الإضافات والإضافات
// ------------------------------------------------------------
export async function createRestaurantGroup(data) {
  await assertModule("restaurant");
  return prisma.restaurantModifierGroup
    .create({ data, select: { id: true } })
    .catch((e) => handleUnique(e, "RestaurantGroupExists"));
}

export async function updateRestaurantGroup({ id, ...data }) {
  await assertModule("restaurant");
  return prisma.restaurantModifierGroup
    .update({ where: { id }, data, select: { id: true } })
    .catch(saveError("RestaurantGroupNotFound", "RestaurantGroupExists"));
}

// المجموعة اللي فيها إضافات ما تتمسحش (تتمسح إضافاتها الأول)
export async function deleteRestaurantGroup(id) {
  await assertModule("restaurant");
  const used = await prisma.restaurantModifier.count({ where: { groupId: id } });
  if (used) throw new AppError("RestaurantGroupInUse");
  await prisma.restaurantModifierGroup
    .delete({ where: { id } })
    .catch(handleMissing("RestaurantGroupNotFound"));
  return { id };
}

async function assertGroup(groupId) {
  const g = await prisma.restaurantModifierGroup.findUnique({
    where: { id: groupId },
    select: { id: true },
  });
  if (!g)
    throw new AppError("RestaurantGroupNotFound", null, {
      groupId: "RestaurantGroupNotFound",
    });
}

export async function createRestaurantModifier(data) {
  await assertModule("restaurant");
  await assertGroup(data.groupId);
  return prisma.restaurantModifier
    .create({ data, select: { id: true } })
    .catch((e) => handleUnique(e, "RestaurantModifierExists"));
}

export async function updateRestaurantModifier({ id, ...data }) {
  await assertModule("restaurant");
  await assertGroup(data.groupId);
  return prisma.restaurantModifier
    .update({ where: { id }, data, select: { id: true } })
    .catch(saveError("RestaurantModifierNotFound", "RestaurantModifierExists"));
}

export async function deleteRestaurantModifier(id) {
  await assertModule("restaurant");
  await prisma.restaurantModifier
    .delete({ where: { id } })
    .catch(handleMissing("RestaurantModifierNotFound"));
  return { id };
}

// ------------------------------------------------------------
// أصناف المنيو
// ------------------------------------------------------------

// بحث الأصناف اللي لسه مش في المنيو (إضافة أصناف)
export async function searchMenuCandidates(q) {
  await assertModule("restaurant");
  const text = q.trim();
  return prisma.product.findMany({
    where: {
      isActive: true,
      modelId: null,
      restaurantItem: null,
      // أصناف الرسوم (الخدمة / التوصيل / التبغ) مش من المنيو
      code: { notIn: Object.values(FEE_CODES) },
      ...(text
        ? {
            OR: [
              { code: { contains: text } },
              { arName: { contains: text } },
              { enName: { contains: text } },
            ],
          }
        : {}),
    },
    orderBy: { id: "desc" },
    take: 30,
    select: { ...nameSel, code: true, price: true },
  });
}

// إضافة أصناف للمنيو (ترتيبها بعد آخر صنف)
export async function addRestaurantItems(productIds) {
  await assertModule("restaurant");
  const ids = [...new Set(productIds)];
  const found = await prisma.product.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw new AppError("ProductNotFound");
  const last = await prisma.restaurantItem.aggregate({
    _max: { sortOrder: true },
  });
  let order = last._max.sortOrder ?? 0;
  const res = await prisma.restaurantItem.createMany({
    data: ids.map((productId) => ({ productId, sortOrder: ++order })),
    skipDuplicates: true,
  });
  return { added: res.count };
}

// شيل الصنف من المنيو (الصنف نفسه بيفضل، وأحجامه وأسعاره بتتمسح)
export async function removeRestaurantItem(productId) {
  await assertModule("restaurant");
  await prisma.restaurantItem
    .delete({ where: { productId } })
    .catch(handleMissing("RestaurantItemNotFound"));
  return { productId };
}

// أجزاء المنيو: الأحجام بأسعارها + مجموعات الإضافات + أسعار التطبيقات
// (بتتكتب بعد حفظ الصنف نفسه، وسطر المنيو بيتعمل لو مش موجود)
async function validateMenuParts({ sizes, groupIds, channelPrices }) {
  const sizeIds = sizes.map((s) => s.sizeId);
  const uniqGroups = [...new Set(groupIds)];
  if (new Set(sizeIds).size !== sizeIds.length)
    throw new AppError("RestaurantDuplicateSize");
  const [sizeCount, groupCount] = await Promise.all([
    sizeIds.length
      ? prisma.restaurantSize.count({ where: { id: { in: sizeIds } } })
      : 0,
    uniqGroups.length
      ? prisma.restaurantModifierGroup.count({ where: { id: { in: uniqGroups } } })
      : 0,
  ]);
  if (sizeCount !== sizeIds.length) throw new AppError("RestaurantSizeNotFound");
  if (groupCount !== uniqGroups.length)
    throw new AppError("RestaurantGroupNotFound");

  // سعر التطبيق: على حجم من أحجام الصنف (أو 0 لو الصنف من غير أحجام)
  const validSizes = new Set(sizeIds.length ? sizeIds : [0]);
  const seen = new Set();
  const prices = [];
  for (const p of channelPrices) {
    if (!validSizes.has(p.sizeId)) continue;
    const key = `${p.channelId}:${p.sizeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    prices.push(p);
  }
  const channelIds = [...new Set(prices.map((p) => p.channelId))];
  if (channelIds.length) {
    const c = await prisma.salesChannel.count({
      where: { id: { in: channelIds } },
    });
    if (c !== channelIds.length) throw new AppError("RestaurantChannelNotFound");
  }
  return { uniqGroups, prices };
}

async function writeMenuParts(
  productId,
  { sortOrder, isTobacco, askPieces, sizes },
  { uniqGroups, prices },
) {
  await runTx(async (tx) => {
    await tx.restaurantItem.upsert({
      where: { productId },
      create: { productId, sortOrder, isTobacco, askPieces },
      update: { sortOrder, isTobacco, askPieces },
    });
    await tx.restaurantItemSize.deleteMany({ where: { productId } });
    if (sizes.length)
      await tx.restaurantItemSize.createMany({
        data: sizes.map((s) => ({ productId, ...s })),
      });
    await tx.restaurantItemGroup.deleteMany({ where: { productId } });
    if (uniqGroups.length)
      await tx.restaurantItemGroup.createMany({
        data: uniqGroups.map((groupId, i) => ({
          productId,
          groupId,
          sortOrder: i,
        })),
      });
    await tx.restaurantChannelPrice.deleteMany({ where: { productId } });
    if (prices.length)
      await tx.restaurantChannelPrice.createMany({
        data: prices.map((p) => ({ productId, ...p })),
      });
  });
  return { productId };
}


// ------------------------------------------------------------
// صنف المنيو من شاشة المطعم (صنف جديد أو تعديل) مرة واحدة:
// الاسم والقسم والسعر والصورة + الأحجام والإضافات وأسعار التطبيقات
// - الجديد: صنف خدمة (من غير مخزون)، والكود فاضي = تلقائي
//   والضريبة من إعدادات البرنامج (النسبة + السعر شامل ولا لأ)
// - التعديل: الاسم والقسم والسعر (وشامل الضريبة ولا لأ) والحالة والصورة بس
//   (باقي بيانات الصنف من شاشة الأصناف)
// ------------------------------------------------------------
export async function saveMenuItem(
  {
    productId,
    image,
    removeImage,
    code,
    arName,
    enName,
    categoryId,
    price,
    isActive,
    priceIncludesTax,
    ...menu
  },
  user,
) {
  await assertModule("restaurant");
  const parts = await validateMenuParts(menu);
  // الصنف بأحجام من غير سعر: سعره = أول حجم (عشان البحث والفواتير العادية)
  const basePrice = price || menu.sizes[0]?.price || 0;

  if (!productId) {
    const s = await prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { taxRate: true, productPriceIncludesTax: true },
    });
    const rate = n(s?.taxRate ?? 15);
    const created = await createProduct(
      {
        code: code || (await nextProductCode()),
        arName,
        enName,
        categoryId: categoryId ?? null,
        baseUnitId: null,
        cost: 0,
        price: basePrice,
        wholesalePrice: 0,
        taxRate: rate,
        // السعر شامل الضريبة: من الفورم (والافتراضي من الإعدادات)
        isPriceIncludeTax:
          priceIncludesTax ?? Boolean(s?.productPriceIncludesTax),
        ...(rate > 0
          ? { taxCategory: "S" }
          : {
              taxCategory: "O",
              taxExemptionCode: "VATEX-SA-OOS",
              taxExemptionReason: "Out of scope",
            }),
        startStock: 0,
        isActive,
        isService: true,
        image,
        units: [],
      },
      user,
    );
    await writeMenuParts(created.id, menu, parts);
    return { productId: created.id };
  }

  const current = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, image: true, categoryId: true },
  });
  if (!current) throw new AppError("ProductNotFound");
  const cat = categoryId ?? current.categoryId;
  await assertUniqueName({ arName, enName, categoryId: cat }, productId);

  let newImage;
  if (image) newImage = await saveImage(image, "products");
  else if (removeImage) newImage = null;
  const imageChanged = newImage !== undefined;
  try {
    await prisma.product.update({
      where: { id: productId },
      data: {
        arName,
        enName,
        categoryId: cat,
        price: basePrice,
        isActive,
        ...(priceIncludesTax != null ? { isPriceIncludeTax: priceIncludesTax } : {}),
        ...(imageChanged ? { image: newImage } : {}),
      },
    });
  } catch (e) {
    if (newImage) await deleteImage(newImage);
    throw e;
  }
  if (imageChanged) await dropImage(current.image);
  await writeMenuParts(productId, menu, parts);
  return { productId };
}

// ------------------------------------------------------------
// السائقين
// ------------------------------------------------------------
export async function createRestaurantDriver(data) {
  await assertModule("restaurant");
  return prisma.restaurantDriver
    .create({ data, select: { id: true } })
    .catch((e) => handleUnique(e, "RestaurantDriverExists"));
}

export async function updateRestaurantDriver({ id, ...data }) {
  await assertModule("restaurant");
  return prisma.restaurantDriver
    .update({ where: { id }, data, select: { id: true } })
    .catch(saveError("RestaurantDriverNotFound", "RestaurantDriverExists"));
}

export async function deleteRestaurantDriver(id) {
  await assertModule("restaurant");
  await prisma.restaurantDriver
    .delete({ where: { id } })
    .catch(handleMissing("RestaurantDriverNotFound"));
  return { id };
}

// ------------------------------------------------------------
// الإعدادات + أصناف الرسوم
// كل رسوم سطر في الفاتورة بصنف خدمة (عليه الضريبة زي أي صنف)
// الصنف بيتعمل لوحده أول ما الرسوم تتفعّل
// ------------------------------------------------------------
const FEE_CODES = {
  service: "FEE-SERVICE",
  delivery: "FEE-DELIVERY",
  tobacco: "FEE-TOBACCO",
};
const FEE_NAMES = {
  service: { arName: "رسوم الخدمة", enName: "Service charge" },
  delivery: { arName: "رسوم التوصيل", enName: "Delivery fee" },
  tobacco: { arName: "رسوم التبغ", enName: "Tobacco fee" },
};
const FEE_FIELDS = {
  service: "restaurantServiceProductId",
  delivery: "restaurantDeliveryProductId",
  tobacco: "restaurantTobaccoProductId",
};

export async function getRestaurantSettings() {
  const s = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: {
      restaurantServiceType: true,
      restaurantServicePercent: true,
      restaurantTobaccoType: true,
      restaurantDefaultOrderType: true,
      restaurantDefaultTableId: true,
      restaurantServiceDineInOnly: true,
      restaurantDeliveryFee: true,
      restaurantTobaccoPercent: true,
      restaurantServiceProductId: true,
      restaurantDeliveryProductId: true,
      restaurantTobaccoProductId: true,
    },
  });
  return {
    serviceType: s?.restaurantServiceType ?? "percent",
    // الكاشير: نوع الطلب الافتراضي + الطاولة الافتراضية (طلبات الطاولات)
    defaultOrderType: s?.restaurantDefaultOrderType ?? "takeaway",
    defaultTableId: s?.restaurantDefaultTableId ?? null,
    servicePercent: n(s?.restaurantServicePercent),
    tobaccoType: s?.restaurantTobaccoType ?? "percent",
    serviceDineInOnly: s?.restaurantServiceDineInOnly ?? true,
    deliveryFee: n(s?.restaurantDeliveryFee),
    tobaccoPercent: n(s?.restaurantTobaccoPercent),
    feeProducts: {
      service: s?.restaurantServiceProductId ?? null,
      delivery: s?.restaurantDeliveryProductId ?? null,
      tobacco: s?.restaurantTobaccoProductId ?? null,
    },
  };
}

// صنف الرسوم: الموجود بالكود، أو صنف خدمة جديد (أول قسم ووحدة)
// الضريبة: نسبة البرنامج، والسعر من غير ضريبة (المبلغ بيتحسب وقت البيع)
async function ensureFeeProduct(kind, taxRate) {
  const code = FEE_CODES[kind];
  // وحدة «خدمة» وقسم «خدمات» (مش أول وحدة في البرنامج: كانت بتطلع «كيلو» جنب الرسوم)
  const [unitId, categoryId] = await Promise.all([
    findOrCreate("unit", "خدمة", "Service"),
    findOrCreate("category", "خدمات", "Services"),
  ]);
  const found = await prisma.product.findUnique({
    where: { code },
    select: { id: true, isActive: true, baseUnitId: true, isPriceIncludeTax: true },
  });
  if (found) {
    // الرسوم شاملة الضريبة: المبلغ بيتسجل زي ما هو (من غير فروق تقريب)
    if (!found.isActive || found.baseUnitId !== unitId || !found.isPriceIncludeTax)
      await prisma.product.update({
        where: { id: found.id },
        data: { isActive: true, baseUnitId: unitId, isPriceIncludeTax: true },
      });
    return found.id;
  }
  const rate = n(taxRate);
  const p = await prisma.product.create({
    data: {
      code,
      ...FEE_NAMES[kind],
      price: 0,
      isService: true,
      taxRate: rate,
      // الرسوم شاملة الضريبة (طلب 40 + توصيل 10 = 50 بالظبط)
      isPriceIncludeTax: true,
      ...(rate > 0
        ? { taxCategory: "S" }
        : {
            taxCategory: "O",
            taxExemptionCode: "VATEX-SA-OOS",
            taxExemptionReason: "Out of scope",
          }),
      categoryId,
      baseUnitId: unitId,
    },
    select: { id: true },
  });
  return p.id;
}

// أصناف الرسوم (الخدمة / التوصيل / التبغ): بتتعمل لوحدها لو مش موجودة
// (الكاشير بيناديها أول ما يفتح، عشان الرسوم تنزل في الفاتورة من غير حفظ الإعدادات)
// مفيش قسم أو وحدة لسه ← بنسيبها (التنبيه بيظهر وقت الحساب)
export async function ensureFeeProducts() {
  const s = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: {
      taxRate: true,
      restaurantServiceProductId: true,
      restaurantDeliveryProductId: true,
      restaurantTobaccoProductId: true,
    },
  });
  const data = {};
  for (const kind of Object.keys(FEE_FIELDS)) {
    const field = FEE_FIELDS[kind];
    let id = s?.[field] ?? null;
    try {
      id = await ensureFeeProduct(kind, s?.taxRate ?? 15);
    } catch {
      continue;
    }
    if (id !== s?.[field]) data[field] = id;
  }
  if (Object.keys(data).length)
    await prisma.systemSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
}

export async function saveRestaurantSettings(v) {
  await assertModule("restaurant");
  const current = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: {
      taxRate: true,
      restaurantServiceProductId: true,
      restaurantDeliveryProductId: true,
      restaurantTobaccoProductId: true,
    },
  });
  const fees = {};
  for (const kind of Object.keys(FEE_FIELDS)) {
    const field = FEE_FIELDS[kind];
    let id = current?.[field] ?? null;
    // الصنف اتمسح؟ يتعمل تاني
    if (id && !(await prisma.product.count({ where: { id } }))) id = null;
    // الكاشير ممكن يكتب أي رسوم في الفاتورة حتى لو الافتراضي 0 ← الأصناف التلاتة بتتعمل دايماً
    if (!id) id = await ensureFeeProduct(kind, current?.taxRate ?? 15);
    fees[field] = id;
  }
  const data = {
    restaurantServiceType: v.serviceType,
    restaurantServicePercent: v.servicePercent,
    restaurantTobaccoType: v.tobaccoType,
    restaurantDefaultOrderType: v.defaultOrderType,
    restaurantDefaultTableId: v.defaultTableId ?? null,
    restaurantServiceDineInOnly: v.serviceDineInOnly,
    restaurantDeliveryFee: v.deliveryFee,
    restaurantTobaccoPercent: v.tobaccoPercent,
    ...fees,
  };
  await prisma.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });
  return getRestaurantSettings();
}
