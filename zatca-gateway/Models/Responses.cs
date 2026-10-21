using System.Text.Json;

namespace ZatcaGateway.Models;

public sealed record CsrResponse(string Csr, string PrivateKey, string SerialNumber, string Environment);

public sealed record CertificateInfo(
    string Subject,
    string Issuer,
    string SerialNumber,
    DateTime NotBefore,
    DateTime NotAfter,
    string Thumbprint,
    int DaysRemaining);

/// <summary>رد طلب شهادة (امتثال أو إنتاج)</summary>
public sealed record CsidResponse(
    bool Ok,
    int HttpStatus,
    string? RequestId,
    string? BinarySecurityToken,
    string? Secret,
    string? DispositionMessage,
    CertificateInfo? Certificate,
    List<ZatcaMessage> Errors,
    JsonElement? Raw);

public sealed record ZatcaMessage(string? Type, string? Code, string? Category, string? Message, string? Status);

public sealed record SignResponse(
    string Xml,
    string Hash,
    string Qr,
    string Uuid,
    JsonElement? Steps,
    JsonElement? Validation);

/// <summary>نتيجة الإرسال للهيئة (إبلاغ / اعتماد / فحص امتثال)</summary>
public sealed record SubmitResponse(
    // الهيئة قبلت الفاتورة (REPORTED / CLEARED)، حتى لو فيه تحذيرات
    bool Accepted,
    // REPORTED | NOT_REPORTED | CLEARED | NOT_CLEARED | PASS | ERROR | NETWORK_ERROR ...
    string Status,
    int HttpStatus,
    // ينفع نعيد المحاولة (مشكلة اتصال أو الهيئة مش متاحة) - مش رفض للفاتورة
    bool Retryable,
    List<ZatcaMessage> Warnings,
    List<ZatcaMessage> Errors,
    string? Hash,
    string? Uuid,
    // الـ XML المعتمد من الهيئة (للضريبية) Base64
    string? ClearedXml,
    // الـ QR من الـ XML المعتمد (للضريبية)
    string? Qr,
    JsonElement? Raw);
