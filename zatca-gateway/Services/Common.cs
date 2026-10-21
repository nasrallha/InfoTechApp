using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using Newtonsoft.Json;
using ZatcaGateway.Models;

namespace ZatcaGateway.Services;

// ============================================================
// إعدادات الخدمة (appsettings.json → قسم Gateway، أو متغيرات بيئة Gateway__ApiKey ...)
// ============================================================
public sealed class GatewayOptions
{
    /// <summary>العنوان اللي الخدمة بتسمع عليه (localhost فقط افتراضياً)</summary>
    public string Urls { get; set; } = "http://127.0.0.1:5089";
    /// <summary>مفتاح سري مشترك مع Next.js (هيدر X-Gateway-Key) - إجباري</summary>
    public string ApiKey { get; set; } = "";
    public int ZatcaTimeoutSeconds { get; set; } = 30;
    /// <summary>كسور سعر الوحدة في الـ XML</summary>
    public int PriceDecimals { get; set; } = 2;
    /// <summary>لغة رسائل الهيئة الافتراضية: en | ar</summary>
    public string Language { get; set; } = "en";
    /// <summary>تغيير روابط البوابة (اختياري): { "developer": "...", "simulation": "...", "production": "..." }</summary>
    public Dictionary<string, string> BaseUrls { get; set; } = new();
}

/// <summary>خطأ متوقع بيرجع للمشروع كـ 400 بكود واضح</summary>
public sealed class GatewayException : Exception
{
    public string Code { get; }
    public object? Details { get; }

    public GatewayException(string code, string message, object? details = null) : base(message)
    {
        Code = code;
        Details = details;
    }
}

public static class JsonUtil
{
    private static readonly JsonSerializerSettings Settings = new()
    {
        ReferenceLoopHandling = ReferenceLoopHandling.Ignore,
        NullValueHandling = NullValueHandling.Ignore,
    };

    /// <summary>يحوّل أي object من الـ SDK (Newtonsoft) لـ JsonElement يرجع في الرد</summary>
    public static JsonElement? ToElement(object? value)
    {
        if (value == null) return null;
        try
        {
            var text = JsonConvert.SerializeObject(value, Settings);
            using var doc = JsonDocument.Parse(text);
            return doc.RootElement.Clone();
        }
        catch
        {
            return null;
        }
    }

    public static JsonElement? Parse(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        try
        {
            using var doc = JsonDocument.Parse(text);
            return doc.RootElement.Clone();
        }
        catch
        {
            return null;
        }
    }

    /// <summary>وصف رسالة خطأ من الـ SDK (نص أو قائمة)</summary>
    public static string Describe(object? value)
    {
        if (value == null) return "";
        if (value is string s) return s;
        if (value is System.Collections.IEnumerable list)
        {
            var parts = new List<string>();
            foreach (var item in list) parts.Add(Convert.ToString(item) ?? "");
            return string.Join(" | ", parts.Where(p => p.Length > 0));
        }
        return Convert.ToString(value) ?? "";
    }
}

public static class CertificateUtil
{
    /// <summary>يشيل سطور PEM والمسافات</summary>
    public static string StripPem(string value)
    {
        var lines = value.Replace("\r", "").Split('\n')
            .Where(l => !l.TrimStart().StartsWith("-----"));
        return string.Concat(lines).Replace(" ", "").Replace("\t", "").Trim();
    }

    /// <summary>
    /// الهيئة بترجع binarySecurityToken = Base64 لنص الشهادة (اللي هو نفسه Base64 DER يبدأ بـ MII).
    /// الدالة بتقبل الشكلين وترجع:
    ///   Content: الشهادة Base64 DER (للتوقيع والتحقق في الـ SDK)
    ///   Token: الـ binarySecurityToken (للاتصال بالهيئة)
    /// </summary>
    public static (string Content, string Token) Normalize(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
            throw new GatewayException("CertificateRequired", "Certificate is required");
        var s = StripPem(input);
        if (s.StartsWith("MII", StringComparison.Ordinal))
            return (s, Convert.ToBase64String(Encoding.UTF8.GetBytes(s)));
        try
        {
            var decoded = StripPem(Encoding.UTF8.GetString(Convert.FromBase64String(s)));
            if (decoded.StartsWith("MII", StringComparison.Ordinal)) return (decoded, s);
        }
        catch (FormatException)
        {
        }
        throw new GatewayException("InvalidCertificate", "Invalid certificate / binarySecurityToken");
    }

    public static string NormalizePrivateKey(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
            throw new GatewayException("PrivateKeyRequired", "Private key is required");
        return StripPem(input);
    }

    public static CertificateInfo Info(string? certificate)
    {
        var (content, _) = Normalize(certificate);
        try
        {
            using var x = new X509Certificate2(Convert.FromBase64String(content));
            var notAfter = x.NotAfter.ToUniversalTime();
            return new CertificateInfo(
                x.Subject,
                x.Issuer,
                x.SerialNumber,
                x.NotBefore.ToUniversalTime(),
                notAfter,
                x.Thumbprint,
                (int)Math.Floor((notAfter - DateTime.UtcNow).TotalDays));
        }
        catch (Exception ex) when (ex is not GatewayException)
        {
            throw new GatewayException("InvalidCertificate", "Unable to read certificate: " + ex.Message);
        }
    }

    public static CertificateInfo? TryInfo(string? certificate)
    {
        try
        {
            return string.IsNullOrWhiteSpace(certificate) ? null : Info(certificate);
        }
        catch
        {
            return null;
        }
    }
}

public static class ZatcaEnv
{
    public const string Developer = "developer";
    public const string Simulation = "simulation";
    public const string Production = "production";

    public static string Normalize(string? env)
    {
        var e = (env ?? "").Trim().ToLowerInvariant();
        return e switch
        {
            "developer" or "developer-portal" or "nonproduction" or "sandbox" => Developer,
            "simulation" => Simulation,
            "production" or "core" => Production,
            _ => throw new GatewayException("InvalidEnvironment", "environment must be developer | simulation | production"),
        };
    }

    public static string DefaultBaseUrl(string env) => env switch
    {
        Developer => "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal",
        Simulation => "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation",
        _ => "https://gw-fatoora.zatca.gov.sa/e-invoicing/core",
    };
}
