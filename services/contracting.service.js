import "server-only";
import { getLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { assertModule } from "@/lib/modules";
import { partyBranchWhere } from "@/lib/party-scope";
import { dbDateToDay, dayToDbDate, formatDay } from "@/lib/dates";
import { formatDocNo, purchaseDocNo, saleDocNo } from "@/lib/doc-number";
import { DEFAULT_TEMPLATE, advanceBalance, certificateDocNo, contractValues, fillTemplate, itemAmount } from "@/lib/contracting";
import { round } from "@/lib/invoice-calc";
import { docNumberWhere, nextBranchNumber } from "./sequence.service";
import { getCompany } from "./company.service";
import { getBaseCurrency } from "./currency.service";
import { getSystemSettings } from "./system-settings.service";

// ============================================================
// المقاولات (وحدة contracting): العقود والمقايسة ونماذج الصيغة وأوامر التغيير
// - العقد مع المالك (owner: إحنا المقاول، الطرف = عميل) أو مقاول باطن (sub: الطرف = مورد)
// - المقايسة: بنود حرة (رقم البند، الوصف، الوحدة، الكمية، السعر، الإجمالي)
// - التعديل الكامل قبل أي فاتورة (الدفعة المقدمة / مستخلص)، وبعدها البيانات النصية بس
//   (الكميات بأوامر التغيير)
// - نص العقد: النموذج بعد ملء الخانات (أو المعدّل من الشاشة) ← بيتحفظ كمرجع
// ============================================================

export const MODULE = "contracting";
export const n = (v) => (v == null ? 0 : Number(v));
export const day = (d) => (d ? dbDateToDay(d) : null);
export const branchScope = (user) =>
  can(user, "allBranches.view") ? {} : { branchId: user.branch.id };
export const contractDocNo = (c) => formatDocNo("constructionContract", c.number, c.docCode);

async function decimalsOf() {
  return (await getBaseCurrency())?.decimals ?? 2;
}

// ------------------------------------------------------------
// صيغ الخانات (نفس اللي في الواجهة) ← نص العقد
// ------------------------------------------------------------
async function templateFormat() {
  const [currency, locale] = await Promise.all([getBaseCurrency(), getLocale()]);
  const symbol = locale === "ar" ? currency?.arSymbol : currency?.enSymbol;
  const decimals = currency?.decimals ?? 2;
  const fixed = (v, d) =>
    Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = (v) => `${fixed(v, decimals)} ${symbol ?? ""}`.trim();
  return {
    money,
    day: (d) => formatDay(d),
    pct: (v) => `${Number(v || 0)}%`,
    row: (it, i) =>
      `${it.itemNo || i + 1}- ${it.description}: ${Number(it.qty)} ${it.unitName ?? ""} × ${fixed(it.price, 2)} = ${money(it.amount)}`,
  };
}

// الطرف ← بيانات الصيغة
const partyOf = (p) =>
  p
    ? {
        name: p.arName,
        idNo: p.idNumber || p.taxNo || null,
        phone: p.phone,
        address: [p.city, p.district, p.street].filter(Boolean).join(" - "),
      }
    : null;

const PARTY_SELECT = {
  id: true,
  code: true,
  arName: true,
  enName: true,
  phone: true,
  taxNo: true,
  city: true,
  district: true,
  street: true,
};

// ------------------------------------------------------------
// النماذج
// ------------------------------------------------------------
export async function listTemplates({ activeOnly = false } = {}) {
  await assertModule(MODULE);
  // أول مرة: النموذج الافتراضي
  if (!(await prisma.constructionTemplate.count())) {
    await prisma.constructionTemplate.create({
      data: { name: "عقد مقاولة", content: DEFAULT_TEMPLATE, isDefault: true },
    });
  }
  return prisma.constructionTemplate.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: [{ isDefault: "desc" }, { id: "asc" }],
    select: { id: true, name: true, kind: true, content: true, isDefault: true, isActive: true },
  });
}

export async function saveTemplate({ id, ...data }) {
  await assertModule(MODULE);
  return prisma.$transaction(async (tx) => {
    // نموذج افتراضي واحد بس
    if (data.isDefault)
      await tx.constructionTemplate.updateMany({
        where: id ? { id: { not: id } } : {},
        data: { isDefault: false },
      });
    if (id) {
      const found = await tx.constructionTemplate.findUnique({ where: { id }, select: { id: true } });
      if (!found) throw new AppError("NotFound");
      return tx.constructionTemplate.update({ where: { id }, data, select: { id: true } });
    }
    return tx.constructionTemplate.create({ data, select: { id: true } });
  });
}

export async function deleteTemplate(id) {
  await assertModule(MODULE);
  // العقود القديمة نصها محفوظ فيها (النموذج مرجع بس)
  await prisma.constructionTemplate.delete({ where: { id } }).catch(() => {
    throw new AppError("NotFound");
  });
  return { deleted: 1 };
}

// ------------------------------------------------------------
// خيارات شاشة العقد: الأطراف + عقود المالك (لربط الباطن) + النماذج + الضريبة
// ------------------------------------------------------------
export async function contractFormOptions(user, kind) {
  await assertModule(MODULE);
  const [parties, owners, templates, company, settings, decimals] = await Promise.all([
    kind === "sub"
      ? prisma.supplier.findMany({
          where: { isActive: true, ...partyBranchWhere(user) },
          orderBy: { code: "asc" },
          select: PARTY_SELECT,
        })
      : prisma.customer.findMany({
          where: { isActive: true, ...partyBranchWhere(user) },
          orderBy: { code: "asc" },
          select: { ...PARTY_SELECT, idNumber: true },
        }),
    kind === "sub"
      ? prisma.constructionContract.findMany({
          where: { kind: "owner", isDirect: false, status: { not: "cancelled" }, ...branchScope(user) },
          orderBy: { id: "desc" },
          take: 500,
          select: { id: true, number: true, docCode: true, projectName: true },
        })
      : [],
    listTemplates({ activeOnly: true }),
    getCompany(),
    getSystemSettings(),
    decimalsOf(),
  ]);
  return {
    kind,
    parties,
    owners: owners.map((o) => ({ ...o, docNo: contractDocNo(o) })),
    templates: templates.filter((x) => !x.kind || x.kind === kind),
    companyName: company?.arName ?? "",
    taxRate: Number(settings.taxRate ?? 15),
    decimals,
  };
}

// ------------------------------------------------------------
// عقود المالك السارية (شاشة «مستخلص جديد»: اختيار العقد ← مستخلص العقد)
// ------------------------------------------------------------
export async function activeOwnerContracts(user) {
  await assertModule(MODULE);
  const rows = await prisma.constructionContract.findMany({
    where: { kind: "owner", isDirect: false, status: "active", ...branchScope(user) },
    orderBy: { id: "desc" },
    take: 500,
    select: { id: true, number: true, docCode: true, projectName: true, customerId: true },
  });
  return rows.map((c) => ({ id: c.id, docNo: contractDocNo(c), projectName: c.projectName, customerId: c.customerId }));
}

// ------------------------------------------------------------
// القائمة
// ------------------------------------------------------------
export async function listContracts({ kind = "owner", status = "active", q = "", page = 1, pageSize = 30 }, user) {
  await assertModule(MODULE);
  const text = q.trim();
  const ref = text ? await docNumberWhere(text, user) : null;
  const where = {
    kind,
    isDirect: false,
    ...branchScope(user),
    ...(status && status !== "all" ? { status } : {}),
    ...(text
      ? {
          OR: [
            { projectName: { contains: text } },
            { refNo: { contains: text } },
            { customer: { arName: { contains: text } } },
            { customer: { phone: { contains: text } } },
            { supplier: { arName: { contains: text } } },
            { supplier: { phone: { contains: text } } },
            ...(ref ? [ref] : []),
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.constructionContract.count({ where }),
    prisma.constructionContract.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true,
        docCode: true,
        projectName: true,
        refNo: true,
        signDate: true,
        endDate: true,
        totalAmount: true,
        status: true,
        customer: { select: { arName: true, enName: true, phone: true } },
        supplier: { select: { arName: true, enName: true, phone: true } },
        certificates: { where: { cancelled: false }, select: { gross: true } },
      },
    }),
  ]);
  return {
    total,
    page,
    pageSize,
    rows: rows.map((r) => {
      const done = r.certificates.reduce((s, c) => s + n(c.gross), 0);
      const value = n(r.totalAmount);
      return {
        id: r.id,
        docNo: contractDocNo(r),
        projectName: r.projectName,
        refNo: r.refNo,
        signDate: day(r.signDate),
        endDate: day(r.endDate),
        totalAmount: value,
        status: r.status,
        party: r.customer ?? r.supplier,
        certified: done,
        progress: value > 0 ? Math.min(100, Math.round((done / value) * 1000) / 10) : 0,
        certificates: r.certificates.length,
      };
    }),
  };
}

// ------------------------------------------------------------
// العقد كامل (التفاصيل والطباعة والتعديل)
// ------------------------------------------------------------
const docOf = (kind, x) =>
  x
    ? {
        id: x.id,
        type: x.type,
        docNo: kind === "sub" ? purchaseDocNo(x.type, x.number, x.docCode) : saleDocNo(x.type, x.number, x.docCode),
        totalAmount: n(x.totalAmount),
        remaining: Math.max(0, round(n(x.remainingAmount) - n(x.settledAmount), 2)),
        // موقّعة للزكاة أو عليها سندات ← الحذف مقفول
        locked: Boolean(x.zatcaDocument) || n(x.settledAmount) > 0,
        // السداد على الفاتورة نفسها (نافذة تعديل الدفعة المقدمة)
        paid: round(n(x.totalAmount) - n(x.remainingAmount), 2),
        payment: x.payments?.[0]
          ? { paymentMethodId: x.payments[0].paymentMethodId, reference: x.payments[0].reference }
          : null,
      }
    : null;

const SALE_DOC = {
  select: {
    id: true,
    type: true,
    number: true,
    docCode: true,
    totalAmount: true,
    remainingAmount: true,
    settledAmount: true,
    zatcaDocument: { select: { id: true } },
    payments: { take: 1, select: { paymentMethodId: true, reference: true } },
  },
};
const PURCHASE_DOC = {
  select: {
    id: true,
    type: true,
    number: true,
    docCode: true,
    totalAmount: true,
    remainingAmount: true,
    settledAmount: true,
    payments: { take: 1, select: { paymentMethodId: true, reference: true } },
  },
};

export async function getContract(id, user) {
  await assertModule(MODULE);
  const c = await prisma.constructionContract.findFirst({
    where: { id, ...branchScope(user) },
    select: {
      id: true,
      number: true,
      docCode: true,
      kind: true,
      projectName: true,
      projectLocation: true,
      refNo: true,
      signDate: true,
      startDate: true,
      endDate: true,
      taxRate: true,
      isDirect: true,
      advancePct: true,
      advanceAmount: true,
      priorAdvance: true,
      recoveryPct: true,
      retentionPct: true,
      retentionReleaseDate: true,
      penaltyPerDay: true,
      penaltyMaxPct: true,
      baseAmount: true,
      totalAmount: true,
      status: true,
      templateId: true,
      content: true,
      notes: true,
      createdAt: true,
      branchId: true,
      branch: { select: { id: true, arName: true, enName: true } },
      createdBy: { select: { arFullname: true, enFullname: true } },
      customer: { select: { ...PARTY_SELECT, idNumber: true } },
      supplier: { select: PARTY_SELECT },
      parent: { select: { id: true, number: true, docCode: true, projectName: true } },
      subs: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          number: true,
          docCode: true,
          projectName: true,
          totalAmount: true,
          status: true,
          supplier: { select: { arName: true, enName: true } },
          certificates: { where: { cancelled: false }, select: { gross: true } },
        },
      },
      advanceSale: SALE_DOC,
      advancePurchase: PURCHASE_DOC,
      items: {
        orderBy: { seq: "asc" },
        select: {
          id: true,
          seq: true,
          itemNo: true,
          description: true,
          unitName: true,
          qty: true,
          originalQty: true,
          price: true,
          amount: true,
          changeOrderId: true,
          certLines: { where: { certificate: { cancelled: false } }, select: { qty: true, amount: true } },
        },
      },
      changeOrders: {
        orderBy: { seq: "asc" },
        select: {
          id: true,
          seq: true,
          date: true,
          title: true,
          amount: true,
          notes: true,
          createdBy: { select: { arFullname: true, enFullname: true } },
          changeLines: {
            select: {
              qtyDelta: true,
              price: true,
              amount: true,
              item: { select: { itemNo: true, description: true, unitName: true } },
            },
          },
        },
      },
      certificates: {
        orderBy: { seq: "asc" },
        select: {
          id: true,
          seq: true,
          number: true,
          docCode: true,
          date: true,
          periodFrom: true,
          periodTo: true,
          mode: true,
          isFinal: true,
          gross: true,
          recovery: true,
          taxAmount: true,
          invoiceTotal: true,
          retention: true,
          penalty: true,
          netPayable: true,
          clientRef: true,
          cancelled: true,
          returnDocId: true,
          sale: SALE_DOC,
          purchase: PURCHASE_DOC,
        },
      },
      payments: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          kind: true,
          date: true,
          amount: true,
          notes: true,
          voucher: { select: { id: true, type: true, number: true, docCode: true } },
        },
      },
    },
  });
  if (!c) return null;
  const decimals = await decimalsOf();
  const r = (v) => round(v, decimals);
  const kind = c.kind;
  const party = kind === "sub" ? c.supplier : c.customer;

  const items = c.items.map((it) => ({
    id: it.id,
    seq: it.seq,
    itemNo: it.itemNo,
    description: it.description,
    unitName: it.unitName,
    qty: n(it.qty),
    originalQty: n(it.originalQty),
    price: n(it.price),
    amount: n(it.amount),
    changeOrderId: it.changeOrderId,
    // المنفّذ (كل المستخلصات)
    doneQty: round(it.certLines.reduce((s, l) => s + n(l.qty), 0), 3),
    doneAmount: r(it.certLines.reduce((s, l) => s + n(l.amount), 0)),
  }));

  const certificates = c.certificates.map((x) => ({
    id: x.id,
    seq: x.seq,
    docNo: certificateDocNo(x),
    date: day(x.date),
    periodFrom: day(x.periodFrom),
    periodTo: day(x.periodTo),
    mode: x.mode,
    isFinal: x.isFinal,
    gross: n(x.gross),
    recovery: n(x.recovery),
    taxAmount: n(x.taxAmount),
    invoiceTotal: n(x.invoiceTotal),
    retention: n(x.retention),
    penalty: n(x.penalty),
    netPayable: n(x.netPayable),
    clientRef: x.clientRef,
    // ملغي بمرتجع ← خارج حسابات العقد
    cancelled: x.cancelled,
    returnDocId: x.returnDocId,
    // المتبقي على فاتورة المستخلص من غير حجز الضمان (الضمان ليه عموده، ويتحصّل عند الإفراج)
    doc: (() => {
      const d = docOf(kind, kind === "sub" ? x.purchase : x.sale);
      return d ? { ...d, remaining: Math.max(0, r(d.remaining - n(x.retention))) } : d;
    })(),
  }));
  const active = certificates.filter((x) => !x.cancelled);
  const advanceDoc = docOf(kind, kind === "sub" ? c.advancePurchase : c.advanceSale);
  const advanceAmount = n(c.advanceAmount);
  const payments = c.payments.map((p) => ({
    id: p.id,
    kind: p.kind,
    date: day(p.date),
    amount: n(p.amount),
    notes: p.notes,
    voucher: {
      id: p.voucher.id,
      type: p.voucher.type,
      docNo: formatDocNo(p.voucher.type, p.voucher.number, p.voucher.docCode),
    },
  }));

  // موقف العقد
  const sum = (list, key) => r(list.reduce((s, x) => s + x[key], 0));
  const recovered = sum(active, "recovery");
  const retentionHeld = sum(active, "retention");
  const retentionReleased = r(payments.filter((p) => p.kind === "retention").reduce((s, p) => s + p.amount, 0));
  const certified = sum(active, "gross");
  const invoiced = r(sum(active, "invoiceTotal") + (advanceDoc?.totalAmount ?? 0));
  const penalties = sum(active, "penalty");
  const collected = r(payments.reduce((s, p) => s + p.amount, 0));
  const totalAmount = n(c.totalAmount);
  const position = {
    baseAmount: n(c.baseAmount),
    totalAmount,
    totalWithTax: r(totalAmount * (1 + n(c.taxRate) / 100)),
    changes: r(totalAmount - n(c.baseAmount)),
    certified,
    progress: totalAmount > 0 ? Math.min(100, Math.round((certified / totalAmount) * 1000) / 10) : 0,
    remainingWorks: r(totalAmount - certified),
    advanceAmount,
    advanceIssued: Boolean(advanceDoc),
    recovered,
    // رصيد دفعة مقدمة سابقة (اتفوترت برّه البرنامج)
    priorAdvance: n(c.priorAdvance),
    // باقي الدفعة المقدمة اللي اتفوترت ولسه ما اتستردتش
    advanceLeft: advanceBalance({
      advanceIssued: Boolean(advanceDoc),
      advanceAmount,
      priorAdvance: c.priorAdvance,
      recovered,
    }),
    retentionHeld,
    retentionReleased,
    retentionLeft: r(retentionHeld - retentionReleased),
    penalties,
    invoiced,
    collected,
    // المستحق = الفواتير - الغرامات (تسوية) - المحصّل
    due: r(invoiced - penalties - collected),
  };

  const hasInvoices = Boolean(advanceDoc) || certificates.length > 0;
  return {
    id: c.id,
    docNo: contractDocNo(c),
    number: c.number,
    kind,
    isDirect: c.isDirect,
    priorAdvance: n(c.priorAdvance),
    projectName: c.projectName,
    projectLocation: c.projectLocation,
    refNo: c.refNo,
    signDate: day(c.signDate),
    startDate: day(c.startDate),
    endDate: day(c.endDate),
    taxRate: n(c.taxRate),
    advancePct: n(c.advancePct),
    recoveryPct: n(c.recoveryPct),
    retentionPct: n(c.retentionPct),
    retentionReleaseDate: day(c.retentionReleaseDate),
    penaltyPerDay: n(c.penaltyPerDay),
    penaltyMaxPct: n(c.penaltyMaxPct),
    status: c.status,
    templateId: c.templateId,
    content: c.content,
    notes: c.notes,
    createdAt: c.createdAt,
    branch: c.branch,
    createdBy: c.createdBy,
    party,
    parent: c.parent ? { ...c.parent, docNo: contractDocNo(c.parent) } : null,
    subs: c.subs.map((s) => ({
      id: s.id,
      docNo: contractDocNo(s),
      projectName: s.projectName,
      totalAmount: n(s.totalAmount),
      status: s.status,
      supplier: s.supplier,
      certified: r(s.certificates.reduce((t, x) => t + n(x.gross), 0)),
    })),
    items,
    changeOrders: c.changeOrders.map((o) => ({
      id: o.id,
      seq: o.seq,
      date: day(o.date),
      title: o.title,
      amount: n(o.amount),
      notes: o.notes,
      createdBy: o.createdBy,
      lines: o.changeLines.map((l) => ({
        ...l.item,
        qtyDelta: n(l.qtyDelta),
        price: n(l.price),
        amount: n(l.amount),
      })),
    })),
    certificates,
    advanceDoc,
    payments,
    position,
    hasInvoices,
    // التعديل الكامل (البنود والنسب والطرف): قبل أي فاتورة
    editable: c.status === "active" && !hasInvoices,
    decimals,
  };
}

// ------------------------------------------------------------
// الحفظ (إضافة / تعديل)
// ------------------------------------------------------------

// النص النهائي: المكتوب من الشاشة (أو النموذج) + ملء الخانات الباقية (رقم العقد ...)
async function renderContent(tx, data, ctx) {
  let content = data.content;
  if (!content && data.templateId) {
    const t = await tx.constructionTemplate.findUnique({
      where: { id: data.templateId },
      select: { content: true },
    });
    content = t?.content ?? null;
  }
  if (!content) return null;
  const [fmt, decimals] = await Promise.all([templateFormat(), decimalsOf()]);
  return fillTemplate(content, contractValues(ctx, fmt, decimals));
}

// البنود ← بيانات الحفظ (الإجمالي المكتوب أو الكمية × السعر)
const itemRows = (items, decimals) =>
  items.map((it, i) => {
    const amount = it.amount != null ? round(it.amount, decimals) : itemAmount(it.qty, it.price, decimals);
    return {
      seq: i + 1,
      itemNo: it.itemNo,
      description: it.description,
      unitName: it.unitName,
      qty: it.qty,
      originalQty: it.qty,
      price: it.price,
      amount,
    };
  });

export async function saveContract({ id, ...data }, user) {
  await assertModule(MODULE);
  const decimals = await decimalsOf();
  const settings = await getSystemSettings();

  // الطرف: عميل (عقد المالك) / مورد (عقد الباطن) متاح للمستخدم
  const party =
    data.kind === "sub"
      ? await prisma.supplier.findFirst({
          where: { id: data.supplierId, ...partyBranchWhere(user) },
          select: PARTY_SELECT,
        })
      : await prisma.customer.findFirst({
          where: { id: data.customerId, ...partyBranchWhere(user) },
          select: { ...PARTY_SELECT, idNumber: true },
        });
  if (!party) throw new AppError(data.kind === "sub" ? "SupplierNotFound" : "CustomerNotFound");

  // قيمة العقد مكتوبة (البنود في المستخلص)، والعقود القديمة: مجموع المقايسة
  const items = itemRows(data.items, decimals);
  const total = items.length
    ? round(items.reduce((s, it) => s + it.amount, 0), decimals)
    : round(data.contractValue, decimals);

  return prisma.$transaction(
    async (tx) => {
      let current = null;
      if (id) {
        current = await tx.constructionContract.findFirst({
          where: { id, ...branchScope(user) },
          select: {
            id: true,
            kind: true,
            number: true,
            docCode: true,
            branchId: true,
            status: true,
            taxRate: true,
            advanceSaleId: true,
            advancePurchaseId: true,
            _count: { select: { certificates: true } },
          },
        });
        if (!current) throw new AppError("ContractNotFound");
        // بعد أي فاتورة: البيانات النصية والمواعيد بس (الكميات بأوامر التغيير)
        const invoiced =
          current.advanceSaleId || current.advancePurchaseId || current._count.certificates > 0;
        if (invoiced || current.status !== "active") {
          return tx.constructionContract.update({
            where: { id },
            data: {
              projectName: data.projectName,
              projectLocation: data.projectLocation,
              refNo: data.refNo,
              endDate: dayToDbDate(data.endDate),
              retentionReleaseDate: data.retentionReleaseDate ? dayToDbDate(data.retentionReleaseDate) : null,
              penaltyPerDay: data.penaltyPerDay,
              penaltyMaxPct: data.penaltyMaxPct,
              content: data.content || undefined,
              notes: data.notes,
            },
            select: { id: true },
          });
        }
      }

      // عقد الباطن: المشروع لازم يكون عقد مالك متاح
      let parentId = null;
      if (data.kind === "sub" && data.parentId) {
        const parent = await tx.constructionContract.findFirst({
          where: { id: data.parentId, kind: "owner", ...branchScope(user) },
          select: { id: true },
        });
        if (!parent) throw new AppError("ContractNotFound");
        parentId = parent.id;
      }

      const branchId = current?.branchId ?? user.branch.id;
      const seq = current
        ? { number: current.number, docCode: current.docCode }
        : await nextBranchNumber(tx, "constructionContract", branchId);
      const company = await getCompany();
      const taxRate = current ? n(current.taxRate) : Number(settings.taxRate ?? 15);
      const content = await renderContent(tx, data, {
        kind: data.kind,
        docNo: formatDocNo("constructionContract", seq.number, seq.docCode),
        refNo: data.refNo,
        signDate: data.signDate,
        companyName: company?.arName ?? "",
        party: partyOf(party),
        projectName: data.projectName,
        projectLocation: data.projectLocation,
        startDate: data.startDate,
        endDate: data.endDate,
        taxRate,
        advancePct: data.advancePct,
        recoveryPct: data.recoveryPct,
        retentionPct: data.retentionPct,
        retentionReleaseDate: data.retentionReleaseDate,
        penaltyPerDay: data.penaltyPerDay,
        penaltyMaxPct: data.penaltyMaxPct,
        value: total,
        items,
      });

      const row = {
        kind: data.kind,
        customerId: data.kind === "owner" ? party.id : null,
        supplierId: data.kind === "sub" ? party.id : null,
        parentId,
        projectName: data.projectName,
        projectLocation: data.projectLocation,
        refNo: data.refNo,
        signDate: dayToDbDate(data.signDate),
        startDate: data.startDate ? dayToDbDate(data.startDate) : null,
        endDate: dayToDbDate(data.endDate),
        taxRate,
        advancePct: data.advancePct,
        advanceAmount: round((total * data.advancePct) / 100, decimals),
        priorAdvance: round(data.priorAdvance, decimals),
        recoveryPct: data.recoveryPct,
        retentionPct: data.retentionPct,
        retentionReleaseDate: data.retentionReleaseDate ? dayToDbDate(data.retentionReleaseDate) : null,
        penaltyPerDay: data.penaltyPerDay,
        penaltyMaxPct: data.penaltyMaxPct,
        baseAmount: total,
        totalAmount: total,
        templateId: data.templateId,
        content,
        notes: data.notes,
      };
      if (current) {
        // البنود بتتسجل من جديد (مفيش مستخلصات عليها)
        return tx.constructionContract.update({
          where: { id },
          data: { ...row, items: { deleteMany: {}, create: items } },
          select: { id: true },
        });
      }
      return tx.constructionContract.create({
        data: {
          ...row,
          number: seq.number,
          docCode: seq.docCode,
          branchId,
          createdById: user.id,
          items: { create: items },
        },
        select: { id: true, number: true, docCode: true },
      });
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

// ------------------------------------------------------------
// حالة العقد: إقفال (منتهي) / إعادة فتح / إلغاء (من غير فواتير)
// ------------------------------------------------------------
export async function setContractStatus({ id, status }, user) {
  await assertModule(MODULE);
  const c = await prisma.constructionContract.findFirst({
    where: { id, ...branchScope(user) },
    select: {
      id: true,
      advanceSaleId: true,
      advancePurchaseId: true,
      _count: { select: { certificates: true } },
    },
  });
  if (!c) throw new AppError("ContractNotFound");
  if (status === "cancelled" && (c.advanceSaleId || c.advancePurchaseId || c._count.certificates))
    throw new AppError("ContractHasInvoices");
  await prisma.constructionContract.update({ where: { id }, data: { status } });
  return { id };
}

// ------------------------------------------------------------
// حذف العقد: من غير فواتير ولا سندات (البنود وأوامر التغيير بتتمسح معاه)
// ------------------------------------------------------------
export async function deleteContract(id, user) {
  await assertModule(MODULE);
  const c = await prisma.constructionContract.findFirst({
    where: { id, ...branchScope(user) },
    select: {
      id: true,
      advanceSaleId: true,
      advancePurchaseId: true,
      _count: { select: { certificates: true, payments: true, subs: true } },
    },
  });
  if (!c) throw new AppError("ContractNotFound");
  if (c.advanceSaleId || c.advancePurchaseId || c._count.certificates || c._count.payments)
    throw new AppError("ContractHasInvoices");
  await prisma.$transaction([
    // عقود الباطن المربوطة بتفضل (من غير مشروع)
    prisma.constructionContract.updateMany({ where: { parentId: id }, data: { parentId: null } }),
    prisma.constructionContract.delete({ where: { id } }),
  ]);
  return { deleted: 1 };
}

// ------------------------------------------------------------
// أمر التغيير: زيادة / نقص كمية بند، أو بند جديد ← قيمة العقد بتتعدل
// - الكمية بعد النقص مينفعش تقل عن المنفّذ في المستخلصات
// ------------------------------------------------------------
export async function createChangeOrder(data, user) {
  await assertModule(MODULE);
  const decimals = await decimalsOf();
  return prisma.$transaction(
    async (tx) => {
      const c = await tx.constructionContract.findFirst({
        where: { id: data.contractId, ...branchScope(user) },
        select: {
          id: true,
          status: true,
          items: {
            select: {
              id: true,
              seq: true,
              qty: true,
              price: true,
              amount: true,
              description: true,
              certLines: { where: { certificate: { cancelled: false } }, select: { qty: true } },
            },
          },
          changeOrders: { orderBy: { seq: "desc" }, take: 1, select: { seq: true } },
        },
      });
      if (!c) throw new AppError("ContractNotFound");
      if (c.status !== "active") throw new AppError("ContractNotActive");
      const byId = new Map(c.items.map((it) => [it.id, it]));
      const seq = (c.changeOrders[0]?.seq ?? 0) + 1;
      const order = await tx.constructionChangeOrder.create({
        data: {
          contractId: c.id,
          seq,
          date: dayToDbDate(data.date),
          title: data.title,
          notes: data.notes,
          createdById: user.id,
        },
        select: { id: true },
      });
      let nextSeq = c.items.reduce((m, it) => Math.max(m, it.seq), 0);
      let diff = 0;
      for (const l of data.lines) {
        let item;
        let amount;
        if (l.itemId) {
          item = byId.get(l.itemId);
          if (!item) throw new AppError("ContractItemNotFound");
          const newQty = round(n(item.qty) + l.qtyDelta, 3);
          const done = round(item.certLines.reduce((s, x) => s + n(x.qty), 0), 3);
          if (newQty < 0 || newQty < done - 1e-9)
            throw new AppError("ChangeBelowDone", { item: item.description.slice(0, 80) });
          // السعر: سعر البند (أمر التغيير مبيغيرش سعر بند موجود)
          amount = itemAmount(l.qtyDelta, item.price, decimals);
          await tx.constructionItem.update({
            where: { id: item.id },
            data: { qty: newQty, amount: round(n(item.amount) + amount, decimals) },
          });
          await tx.constructionChangeLine.create({
            data: {
              changeOrderId: order.id,
              itemId: item.id,
              qtyDelta: l.qtyDelta,
              price: item.price,
              amount,
            },
          });
        } else {
          amount = itemAmount(l.qtyDelta, l.price, decimals);
          nextSeq += 1;
          item = await tx.constructionItem.create({
            data: {
              contractId: c.id,
              seq: nextSeq,
              itemNo: l.itemNo,
              description: l.description,
              unitName: l.unitName,
              qty: l.qtyDelta,
              originalQty: 0,
              price: l.price,
              amount,
              changeOrderId: order.id,
            },
            select: { id: true },
          });
          await tx.constructionChangeLine.create({
            data: { changeOrderId: order.id, itemId: item.id, qtyDelta: l.qtyDelta, price: l.price, amount },
          });
        }
        diff = round(diff + amount, decimals);
      }
      await tx.constructionChangeOrder.update({ where: { id: order.id }, data: { amount: diff } });
      await tx.constructionContract.update({
        where: { id: c.id },
        data: { totalAmount: { increment: diff } },
      });
      return { id: order.id, seq, amount: diff };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

// حذف آخر أمر تغيير (الكميات بترجع، والبنود الجديدة بتتشال لو مفيش عليها مستخلصات)
export async function deleteChangeOrder(id, user) {
  await assertModule(MODULE);
  return prisma.$transaction(async (tx) => {
    const o = await tx.constructionChangeOrder.findUnique({
      where: { id },
      select: {
        id: true,
        seq: true,
        amount: true,
        contract: {
          select: {
            id: true,
            branchId: true,
            changeOrders: { orderBy: { seq: "desc" }, take: 1, select: { id: true } },
          },
        },
        changeLines: {
          select: {
            qtyDelta: true,
            amount: true,
            item: {
              select: {
                id: true,
                qty: true,
                amount: true,
                changeOrderId: true,
                certLines: { where: { certificate: { cancelled: false } }, select: { qty: true } },
              },
            },
          },
        },
      },
    });
    if (!o || (!can(user, "allBranches.view") && o.contract.branchId !== user.branch.id))
      throw new AppError("NotFound");
    if (o.contract.changeOrders[0]?.id !== o.id) throw new AppError("ChangeNotLast");
    for (const l of o.changeLines) {
      const done = round(l.item.certLines.reduce((s, x) => s + n(x.qty), 0), 3);
      const back = round(n(l.item.qty) - n(l.qtyDelta), 3);
      if (back < done - 1e-9) throw new AppError("ChangeBelowDone", { item: "" });
    }
    for (const l of o.changeLines) {
      if (l.item.changeOrderId === o.id) {
        await tx.constructionItem.delete({ where: { id: l.item.id } });
      } else {
        await tx.constructionItem.update({
          where: { id: l.item.id },
          data: {
            qty: round(n(l.item.qty) - n(l.qtyDelta), 3),
            amount: round(n(l.item.amount) - n(l.amount), 4),
          },
        });
      }
    }
    await tx.constructionChangeOrder.delete({ where: { id: o.id } });
    await tx.constructionContract.update({
      where: { id: o.contract.id },
      data: { totalAmount: { decrement: n(o.amount) } },
    });
    return { deleted: 1 };
  });
}
