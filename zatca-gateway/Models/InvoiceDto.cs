namespace ZatcaGateway.Models;

// ============================================================
// بيانات الفاتورة اللي المشروع بيبعتها (والـ Gateway بيبني منها الـ XML بصيغة UBL 2.1)
// كل المبالغ قبل الضريبة وبالموجب (حتى في الإشعار الدائن)
// ============================================================

public sealed class InvoiceDto
{
    /// <summary>رقم الفاتورة (BT-1)</summary>
    public string Id { get; set; } = "";
    /// <summary>UUID ثابت للفاتورة (يتحدد مرة واحدة ولا يتغير مع إعادة المحاولة)</summary>
    public string Uuid { get; set; } = "";
    /// <summary>yyyy-MM-dd</summary>
    public string IssueDate { get; set; } = "";
    /// <summary>HH:mm:ss</summary>
    public string IssueTime { get; set; } = "";
    /// <summary>"simplified" (B2C) | "standard" (B2B)</summary>
    public string Kind { get; set; } = "simplified";
    /// <summary>"invoice" (388) | "credit" (381) | "debit" (383)</summary>
    public string DocumentType { get; set; } = "invoice";
    public InvoiceFlags? Flags { get; set; }
    /// <summary>عداد الفواتير (ICV) للوحدة</summary>
    public long Icv { get; set; }
    /// <summary>هاش الفاتورة السابقة (Base64) - لأول فاتورة: هاش "0"</summary>
    public string Pih { get; set; } = "";
    public string Currency { get; set; } = "SAR";
    public string? Note { get; set; }

    /// <summary>رقم الفاتورة الأصلية (مطلوب للإشعار الدائن/المدين)</summary>
    public string? BillingReference { get; set; }
    /// <summary>سبب إصدار الإشعار (مطلوب للإشعار الدائن/المدين)</summary>
    public string? Reason { get; set; }

    /// <summary>تاريخ التوريد (افتراضياً تاريخ الفاتورة)</summary>
    public string? SupplyDate { get; set; }
    public string? SupplyEndDate { get; set; }

    /// <summary>10 نقدي | 30 آجل | 42 تحويل بنكي | 48 بطاقة | 1 غير محدد</summary>
    public string PaymentMeansCode { get; set; } = "10";

    public PartyDto Seller { get; set; } = new();
    public PartyDto? Buyer { get; set; }

    public List<InvoiceLineDto> Lines { get; set; } = new();

    /// <summary>المدفوع مقدماً</summary>
    public decimal PrepaidAmount { get; set; }
    /// <summary>
    /// الإجمالي المتوقع شامل الضريبة (من قاعدة البيانات). لو اختلف عن الحساب بقروش،
    /// الفرق بيتكتب كـ PayableRoundingAmount عشان المبلغ المستحق يطابق اللي اتدفع
    /// </summary>
    public decimal? PayableAmount { get; set; }
}

public sealed class InvoiceFlags
{
    public bool ThirdParty { get; set; }
    public bool Nominal { get; set; }
    public bool Exports { get; set; }
    public bool Summary { get; set; }
    public bool SelfBilled { get; set; }
}

public sealed class PartyDto
{
    /// <summary>الاسم القانوني</summary>
    public string Name { get; set; } = "";
    /// <summary>الرقم الضريبي (15 رقم)</summary>
    public string? VatNumber { get; set; }
    /// <summary>نوع المعرّف: CRN سجل تجاري | MOM | MLS | 700 | SAG | NAT هوية | TIN | GCC | IQA إقامة | PAS جواز | OTH</summary>
    public string? IdScheme { get; set; }
    public string? IdValue { get; set; }
    public AddressDto? Address { get; set; }
}

public sealed class AddressDto
{
    public string? Street { get; set; }
    public string? AdditionalStreet { get; set; }
    /// <summary>رقم المبنى (4 أرقام)</summary>
    public string? BuildingNumber { get; set; }
    /// <summary>الرقم الإضافي</summary>
    public string? AdditionalNumber { get; set; }
    /// <summary>الحي</summary>
    public string? District { get; set; }
    public string? City { get; set; }
    /// <summary>الرمز البريدي (5 أرقام)</summary>
    public string? PostalCode { get; set; }
    public string? Region { get; set; }
    public string CountryCode { get; set; } = "SA";
}

public sealed class InvoiceLineDto
{
    public string Name { get; set; } = "";
    public decimal Quantity { get; set; }
    /// <summary>كود الوحدة (UN/ECE Rec 20) مثل PCE</summary>
    public string UnitCode { get; set; } = "PCE";
    /// <summary>سعر الوحدة قبل الضريبة وقبل الخصم</summary>
    public decimal UnitPrice { get; set; }
    /// <summary>إجمالي خصم السطر قبل الضريبة (خصم الصنف + نصيبه من خصم الفاتورة)</summary>
    public decimal Discount { get; set; }
    /// <summary>S خاضع | Z صفري | E معفى | O خارج النطاق</summary>
    public string TaxCategory { get; set; } = "S";
    public decimal TaxPercent { get; set; } = 15m;
    /// <summary>كود سبب الإعفاء (VATEX-SA-..) - مطلوب مع Z / E / O</summary>
    public string? ExemptionReasonCode { get; set; }
    public string? ExemptionReason { get; set; }
    /// <summary>صافي السطر قبل الضريبة (لو متبعت بيتاخد زي ما هو من قاعدة البيانات)</summary>
    public decimal? NetAmount { get; set; }
    /// <summary>ضريبة السطر (لو متبعتة بتتاخد زي ما هي)</summary>
    public decimal? TaxAmount { get; set; }
}
