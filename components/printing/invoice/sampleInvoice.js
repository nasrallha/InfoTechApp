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
