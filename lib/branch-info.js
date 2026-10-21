// ============================================================
// بيانات الفرع في الفاتورة/المستند
// العنوان الوطني والتليفون والسجل التجاري: من الفرع، ولو فاضية من بيانات الشركة
// الرقم الضريبي دائماً للشركة (الفروع تحت نفس الرقم)
// ============================================================

const ADDRESS_FIELDS = [
  "buildingNo",
  "street",
  "district",
  "city",
  "postalCode",
  "additionalNo",
];

// الفرع عنده عنوان وطني؟ (أي حقل منه)
const hasAddress = (x) => Boolean(x && ADDRESS_FIELDS.some((f) => x[f]));

export function documentInfo(company, branch) {
  const source = hasAddress(branch) ? branch : company;
  return {
    address: source
      ? {
          buildingNo: source.buildingNo,
          street: source.street,
          district: source.district,
          city: source.city,
          postalCode: source.postalCode,
          additionalNo: source.additionalNo,
        }
      : null,
    phone: branch?.phone || company?.phone || null,
    email: company?.email || null,
    registrationNo: branch?.registrationNo || company?.registrationNo || null,
    taxNo: company?.taxNo || null,
  };
}

// العنوان في سطر واحد (الموجود فقط)
// additionalLabel: كلمة "رقم فرعي" باللغة المطلوبة
export function addressLine(address, additionalLabel = "رقم فرعي") {
  if (!address) return "";
  return [
    address.buildingNo,
    address.street,
    address.district,
    address.city,
    address.postalCode,
    address.additionalNo && `${additionalLabel} ${address.additionalNo}`,
  ]
    .filter(Boolean)
    .join("، ");
}
