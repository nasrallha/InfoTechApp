namespace ZatcaGateway.Models;

// ============================================================
// طلبات الـ API (JSON بأسماء camelCase)
// environment: "developer" (بوابة المطورين) | "simulation" (المحاكاة) | "production" (الإنتاج)
// ============================================================

/// <summary>بيانات الدخول على بوابة فاتورة (الشهادة + الـ secret + المفتاح الخاص)</summary>
public sealed class Credentials
{
    /// <summary>binarySecurityToken زي ما رجع من الهيئة (أو الشهادة Base64 DER)</summary>
    public string? Certificate { get; set; }
    /// <summary>الـ secret اللي رجع مع الشهادة (لازم للاتصال بالهيئة)</summary>
    public string? Secret { get; set; }
    /// <summary>المفتاح الخاص (Base64 أو PEM) - لازم للتوقيع</summary>
    public string? PrivateKey { get; set; }
}

public sealed class CsrRequest
{
    public string Environment { get; set; } = "developer";
    /// <summary>الاسم المختصر للوحدة (EGS) - حروف وأرقام بدون رموز</summary>
    public string CommonName { get; set; } = "";
    /// <summary>1-اسم الحل|2-الإصدار|3-رقم مميز - لو فاضي بيتولد تلقائي</summary>
    public string? SerialNumber { get; set; }
    /// <summary>الرقم الضريبي 15 رقم</summary>
    public string OrganizationIdentifier { get; set; } = "";
    /// <summary>اسم الفرع (أو الرقم الضريبي للعضو في المجموعة الضريبية)</summary>
    public string OrganizationUnitName { get; set; } = "";
    public string OrganizationName { get; set; } = "";
    public string CountryName { get; set; } = "SA";
    /// <summary>4 أرقام: (ضريبية)(مبسطة)(مستقبلي)(مستقبلي) - 1100 = الاتنين</summary>
    public string InvoiceType { get; set; } = "1100";
    /// <summary>العنوان (المدينة أو العنوان المختصر)</summary>
    public string LocationAddress { get; set; } = "";
    public string IndustryBusinessCategory { get; set; } = "";
    /// <summary>اسم الحل والإصدار في الرقم التسلسلي</summary>
    public string? SolutionName { get; set; }
    public string? SolutionVersion { get; set; }
}

public sealed class ComplianceCsidRequest
{
    public string Environment { get; set; } = "developer";
    /// <summary>الـ CSR زي ما رجع من /csr (Base64)</summary>
    public string Csr { get; set; } = "";
    public string Otp { get; set; } = "";
    public string? Language { get; set; }
}

public sealed class ProductionCsidRequest
{
    public string Environment { get; set; } = "developer";
    public string ComplianceRequestId { get; set; } = "";
    /// <summary>شهادة الامتثال والـ secret بتاعها</summary>
    public Credentials Credentials { get; set; } = new();
    public string? Language { get; set; }
}

public sealed class RenewCsidRequest
{
    public string Environment { get; set; } = "developer";
    /// <summary>CSR جديد</summary>
    public string Csr { get; set; } = "";
    public string Otp { get; set; } = "";
    /// <summary>شهادة الإنتاج الحالية والـ secret بتاعها</summary>
    public Credentials Credentials { get; set; } = new();
    public string? Language { get; set; }
}

public sealed class CertificateInfoRequest
{
    public string Certificate { get; set; } = "";
}

public sealed class BuildRequest
{
    public InvoiceDto Invoice { get; set; } = new();
}

public sealed class SignRequest
{
    public InvoiceDto Invoice { get; set; } = new();
    /// <summary>الشهادة والمفتاح الخاص (الـ secret مش مطلوب للتوقيع)</summary>
    public Credentials Credentials { get; set; } = new();
    /// <summary>تحقق محلي بالـ SDK بعد التوقيع (أبطأ: حوالي 300ms)</summary>
    public bool Validate { get; set; }
}

public sealed class ValidateRequest
{
    /// <summary>الـ XML الموقّع Base64</summary>
    public string Xml { get; set; } = "";
    public string Certificate { get; set; } = "";
    /// <summary>هاش الفاتورة السابقة (Base64)</summary>
    public string Pih { get; set; } = "";
}

public sealed class SubmitRequest
{
    public string Environment { get; set; } = "developer";
    /// <summary>"reporting" للمبسطة | "clearance" للضريبية</summary>
    public string Mode { get; set; } = "reporting";
    /// <summary>الـ XML الموقّع Base64 (زي ما رجع من /invoices/sign)</summary>
    public string Xml { get; set; } = "";
    public Credentials Credentials { get; set; } = new();
    public string? Language { get; set; }
}

public sealed class ComplianceCheckRequest
{
    public string Environment { get; set; } = "developer";
    public InvoiceDto Invoice { get; set; } = new();
    /// <summary>شهادة الامتثال + الـ secret + المفتاح الخاص</summary>
    public Credentials Credentials { get; set; } = new();
    public string? Language { get; set; }
}
