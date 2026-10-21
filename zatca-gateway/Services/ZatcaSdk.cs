using System.Text;
using System.Xml;
using ZATCA.EInvoice.SDK;
using ZATCA.EInvoice.SDK.Contracts;
using ZATCA.EInvoice.SDK.Contracts.Models;
using ZatcaGateway.Models;

namespace ZatcaGateway.Services;

// ============================================================
// غلاف حول الـ SDK الرسمي (ZATCA.EInvoice.SDK 3.4.6)
// - كل نداءات الـ SDK بتعدي من قفل واحد (الـ SDK شغال بـ IKVM/Saxon ومش مضمون إنه thread-safe)
// - التوقيع حوالي 30ms بعد التسخين، التحقق الكامل حوالي 300ms
// ============================================================
public sealed class ZatcaSdk
{
    private readonly object _gate = new();
    private readonly ILogger<ZatcaSdk> _log;

    public ZatcaSdk(ILogger<ZatcaSdk> log)
    {
        _log = log;
    }

    public static string SdkVersion =>
        typeof(EInvoiceSigner).Assembly.GetName().Version?.ToString() ?? "unknown";

    public static string RulesFolder => Path.Combine(AppContext.BaseDirectory, "Rules");

    public static bool RulesFound =>
        Directory.Exists(Path.Combine(RulesFolder, "Schematrons"))
        && Directory.GetFiles(Path.Combine(RulesFolder, "Schematrons"), "*.xsl").Length >= 2;

    private static XmlDocument Load(string xml)
    {
        var doc = new XmlDocument { PreserveWhitespace = true };
        try
        {
            doc.LoadXml(xml);
        }
        catch (XmlException ex)
        {
            throw new GatewayException("InvalidXml", "Invalid XML: " + ex.Message);
        }
        return doc;
    }

    public static string DecodeBase64Xml(string base64)
    {
        try
        {
            return Encoding.UTF8.GetString(Convert.FromBase64String(base64.Trim()));
        }
        catch (FormatException)
        {
            throw new GatewayException("InvalidXml", "xml must be Base64 encoded");
        }
    }

    public static string ToBase64(string text) => Convert.ToBase64String(Encoding.UTF8.GetBytes(text));

    private static EnvironmentType SdkEnvironment(string env) => ZatcaEnv.Normalize(env) switch
    {
        ZatcaEnv.Developer => EnvironmentType.NonProduction,
        ZatcaEnv.Simulation => EnvironmentType.Simulation,
        _ => EnvironmentType.Production,
    };

    // ------------------------------------------------------------
    // CSR + المفتاح الخاص
    // ------------------------------------------------------------
    public CsrResponse GenerateCsr(CsrRequest r)
    {
        var env = ZatcaEnv.Normalize(r.Environment);
        var serial = string.IsNullOrWhiteSpace(r.SerialNumber)
            ? $"1-{Clean(r.SolutionName, "ERP")}|2-{Clean(r.SolutionVersion, "1.0")}|3-{Guid.NewGuid()}"
            : r.SerialNumber.Trim();

        var dto = new CsrGenerationDto(
            r.CommonName?.Trim(),
            serial,
            r.OrganizationIdentifier?.Trim(),
            r.OrganizationUnitName?.Trim(),
            r.OrganizationName?.Trim(),
            string.IsNullOrWhiteSpace(r.CountryName) ? "SA" : r.CountryName.Trim(),
            string.IsNullOrWhiteSpace(r.InvoiceType) ? "1100" : r.InvoiceType.Trim(),
            r.LocationAddress?.Trim(),
            r.IndustryBusinessCategory?.Trim());

        CsrResult result;
        lock (_gate)
        {
            // pemFormat = false: الـ CSR بيرجع Base64 جاهز للإرسال، والمفتاح بدون هيدر
            result = new CsrGenerator().GenerateCsr(dto, SdkEnvironment(env), false);
        }
        if (result == null || !result.IsValid)
            throw new GatewayException("CsrFailed", "CSR generation failed: " + JsonUtil.Describe(result?.ErrorMessages),
                JsonUtil.ToElement(result?.ErrorMessages));

        return new CsrResponse(result.Csr, result.PrivateKey, serial, env);
    }

    private static string Clean(string? v, string fallback)
    {
        var s = (v ?? "").Trim();
        return s.Length == 0 ? fallback : s.Replace("|", "-").Replace("=", "-");
    }

    // ------------------------------------------------------------
    // التوقيع: يرجّع الـ XML الموقّع + الهاش + الـ QR
    // ------------------------------------------------------------
    public SignResponse Sign(string xml, Credentials credentials, string? pihForValidation = null)
    {
        var (certContent, _) = CertificateUtil.Normalize(credentials.Certificate);
        var key = CertificateUtil.NormalizePrivateKey(credentials.PrivateKey);
        var doc = Load(xml);

        SignResult signed;
        lock (_gate)
        {
            signed = new EInvoiceSigner().SignDocument(doc, certContent, key);
        }
        if (signed == null || !signed.IsValid || signed.SignedEInvoice == null)
            throw new GatewayException("SignFailed", "Signing failed: " + JsonUtil.Describe(signed?.ErrorMessage),
                JsonUtil.ToElement(signed?.Steps));

        // نعيد التحميل من النص (نفس اللي هيتخزن ويتبعت بالظبط)
        var signedXml = signed.SignedEInvoice.OuterXml;
        var signedDoc = Load(signedXml);

        RequestResult request;
        QRResult qr;
        lock (_gate)
        {
            request = new RequestGenerator().GenerateRequest(signedDoc);
            qr = new EInvoiceQRGenerator().GenerateEInvoiceQRCode(Load(signedXml));
        }
        if (request == null || !request.IsValid || request.InvoiceRequest == null)
            throw new GatewayException("RequestFailed", "Failed to read signed invoice: " + JsonUtil.Describe(request?.ErrorMessages));
        if (qr == null || !qr.IsValid)
            throw new GatewayException("QrFailed", "QR generation failed: " + JsonUtil.Describe(qr?.ErrorMessage));

        System.Text.Json.JsonElement? validation = null;
        if (pihForValidation != null) validation = ValidateRaw(signedXml, certContent, pihForValidation);

        return new SignResponse(
            ToBase64(signedXml),
            request.InvoiceRequest.InvoiceHash,
            qr.QR,
            request.InvoiceRequest.Uuid,
            JsonUtil.ToElement(signed.Steps),
            validation);
    }

    // ------------------------------------------------------------
    // التحقق المحلي (XSD + قواعد EN + قواعد KSA + التوقيع + QR + PIH)
    // ------------------------------------------------------------
    public System.Text.Json.JsonElement? Validate(string xml, string? certificate, string pih)
    {
        var (certContent, _) = CertificateUtil.Normalize(certificate);
        return ValidateRaw(xml, certContent, pih);
    }

    private System.Text.Json.JsonElement? ValidateRaw(string xml, string certContent, string pih)
    {
        var doc = Load(xml);
        ValidationResult result;
        lock (_gate)
        {
            result = new EInvoiceValidator().ValidateEInvoice(doc, certContent, pih);
        }
        return JsonUtil.ToElement(result);
    }

    // ------------------------------------------------------------
    // جسم الطلب اللي بيتبعت للهيئة: { invoiceHash, uuid, invoice }
    // ------------------------------------------------------------
    public (string Json, string Hash, string Uuid) BuildApiRequest(string signedXml)
    {
        var doc = Load(signedXml);
        RequestResult request;
        lock (_gate)
        {
            request = new RequestGenerator().GenerateRequest(doc);
        }
        if (request == null || !request.IsValid || request.InvoiceRequest == null)
            throw new GatewayException("RequestFailed", "Failed to build API request: " + JsonUtil.Describe(request?.ErrorMessages));
        return (request.InvoiceRequest.Serialize(), request.InvoiceRequest.InvoiceHash, request.InvoiceRequest.Uuid);
    }

    /// <summary>استخراج الـ QR من XML (مثلاً الـ XML المعتمد من الهيئة)</summary>
    public static string? ExtractQr(string xml)
    {
        try
        {
            var doc = Load(xml);
            var ns = new XmlNamespaceManager(doc.NameTable);
            ns.AddNamespace("cac", "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2");
            ns.AddNamespace("cbc", "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2");
            return doc.SelectSingleNode(
                "//cac:AdditionalDocumentReference[cbc:ID='QR']/cac:Attachment/cbc:EmbeddedDocumentBinaryObject", ns)?.InnerText;
        }
        catch
        {
            return null;
        }
    }

    public void Log(string message) => _log.LogInformation("{Message}", message);
}
