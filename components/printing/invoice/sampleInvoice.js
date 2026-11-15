// فاتورة تجريبية لمعاينة إعدادات الطباعة (الأسعار بدون الضريبة)
export const sampleInvoice = ({ cashier, withCustomer = true }) => ({
  number: "INV-000125",
  // تاريخ ثابت (نفس النتيجة في السيرفر والمتصفح)
  date: "2026-01-15T07:30:00.000Z",
  cashier,
  customer: withCustomer ? { name: "مؤسسة الأمل التجارية", vatNo: null } : null,
  paymentMethod: "نقدي / Cash",
  items: [
    {
      code: "6281234567895",
      arName: "مياه معدنية 330 مل",
      enName: "Mineral water 330ml",
      unitAr: "كرتونة",
      unitEn: "Carton",
      qty: 2,
      price: 18,
      discount: 0,
      taxRate: 15,
    },
    {
      code: "6280001112223",
      arName: "عصير برتقال 1 لتر",
      enName: "Orange juice 1L",
      unitAr: "قطعة",
      unitEn: "Piece",
      qty: 3,
      price: 7.5,
      discount: 2.5,
      taxRate: 15,
    },
    {
      code: "6289998887776",
      arName: "بسكويت شوكولاتة",
      enName: "Chocolate biscuits",
      unitAr: "علبة",
      unitEn: "Box",
      qty: 1,
      price: 12,
      discount: 0,
      taxRate: 15,
    },
  ],
});

// نفس الفاتورة التجريبية بشكل فاتورة A4 (معاينة نماذج A4 في إعدادات الطباعة)
export function sampleA4Doc(invoice, branch) {
  let subtotal = 0;
  let itemsDiscount = 0;
  let tax = 0;
  const items = invoice.items.map((it, i) => {
    const gross = it.qty * it.price;
    const net = gross - (it.discount ?? 0);
    const t = Math.round(net * it.taxRate) / 100;
    subtotal += gross;
    itemsDiscount += it.discount ?? 0;
    tax += t;
    return {
      id: i + 1,
      code: it.code,
      arName: it.arName,
      enName: it.enName,
      unit: { arName: it.unitAr, enName: it.unitEn },
      qty: it.qty,
      price: it.price,
      itemDiscount: it.discount ?? 0,
      taxRate: it.taxRate,
      taxAmount: t,
      totalAmount: net + t,
    };
  });
  const netAmount = subtotal - itemsDiscount;
  return {
    preview: true,
    type: "sale",
    number: 125,
    docCode: null,
    date: invoice.date,
    customerArName: invoice.customer?.name ?? null,
    customerEnName: invoice.customer ? "Al Amal Trading Est." : null,
    customerTaxNo: invoice.customer?.vatNo ?? null,
    customer: invoice.customer
      ? { code: 15, phone: "0500000000", city: "الرياض", district: "العليا", street: "طريق الملك فهد" }
      : null,
    branch: branch ?? null,
    createdBy: invoice.cashier ? { arFullname: invoice.cashier, enFullname: invoice.cashier } : null,
    items,
    subtotal,
    itemsDiscount,
    invoiceDiscount: 0,
    netAmount,
    taxAmount: tax,
    totalAmount: netAmount + tax,
    payments: [],
    remainingAmount: 0,
  };
}
