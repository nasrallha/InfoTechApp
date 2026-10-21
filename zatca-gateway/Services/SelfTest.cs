using System.Text.Json;
using ZatcaGateway.Models;

namespace ZatcaGateway.Services;

// ============================================================
// اختبار ذاتي بدون إنترنت: يبني الـ 6 أنواع (مبسطة وضريبية × فاتورة / دائن / مدين)
// ويوقّعها بشهادة الهيئة التجريبية اللي جاية مع الـ SDK، ويتحقق منها بالـ SDK
// (XSD + قواعد EN + قواعد KSA + التوقيع + QR + سلسلة PIH)
// لو كله نجح → البناء والتوقيع شغالين صح على الجهاز ده
// ============================================================
public sealed class SelfTest
{
    public const string FirstPih = "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==";

    private readonly ZatcaSdk _sdk;
    private readonly InvoiceXmlBuilder _builder;

    public SelfTest(ZatcaSdk sdk, InvoiceXmlBuilder builder)
    {
        _sdk = sdk;
        _builder = builder;
    }

    public static Credentials SampleCredentials()
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "Samples");
        var cert = Path.Combine(dir, "cert.pem");
        var key = Path.Combine(dir, "ec-secp256k1-priv-key.pem");
        if (!File.Exists(cert) || !File.Exists(key))
            throw new GatewayException("SamplesMissing", "SDK sample certificate not found in " + dir);
        return new Credentials { Certificate = File.ReadAllText(cert), PrivateKey = File.ReadAllText(key) };
    }

    public sealed record Item(string Name, bool Ok, long Icv, string? Hash, string? Error, JsonElement? Validation);

    public object Run(bool validate = true)
    {
        var started = DateTime.UtcNow;
        var creds = SampleCredentials();
        var results = new List<Item>();
        var pih = FirstPih;
        var icv = 1L;

        foreach (var (name, invoice) in Samples())
        {
            invoice.Icv = icv;
            invoice.Pih = pih;
            try
            {
                var (xml, _) = _builder.Build(invoice);
                var signed = _sdk.Sign(xml, creds, validate ? pih : null);
                var ok = !validate || IsValid(signed.Validation);
                results.Add(new Item(name, ok, icv, signed.Hash, null, signed.Validation));
                pih = signed.Hash;
            }
            catch (GatewayException ex)
            {
                results.Add(new Item(name, false, icv, null, ex.Code + ": " + ex.Message, JsonUtil.ToElement(ex.Details)));
            }
            catch (Exception ex)
            {
                results.Add(new Item(name, false, icv, null, ex.GetType().Name + ": " + ex.Message, null));
            }
            icv++;
        }

        return new
        {
            ok = results.All(r => r.Ok),
            sdkVersion = ZatcaSdk.SdkVersion,
            rulesFound = ZatcaSdk.RulesFound,
            os = System.Runtime.InteropServices.RuntimeInformation.OSDescription,
            ms = (int)(DateTime.UtcNow - started).TotalMilliseconds,
            results,
        };
    }

    // نتيجة التحقق من الـ SDK (Newtonsoft بيكتب IsValid)
    private static bool IsValid(JsonElement? v)
    {
        if (v is not { ValueKind: JsonValueKind.Object } o) return false;
        foreach (var p in o.EnumerateObject())
            if (string.Equals(p.Name, "isValid", StringComparison.OrdinalIgnoreCase))
                return p.Value.ValueKind == JsonValueKind.True;
        return false;
    }

    private static PartyDto Seller() => new()
    {
        Name = "شركة توريد التكنولوجيا بأقصى سرعة المحدودة | Maximum Speed Tech Supply LTD",
        VatNumber = "399999999900003",
        IdScheme = "CRN",
        IdValue = "1010010000",
        Address = new AddressDto
        {
            Street = "الامير سلطان | Prince Sultan",
            BuildingNumber = "2322",
            District = "المربع | Al-Murabba",
            City = "الرياض | Riyadh",
            PostalCode = "23333",
        },
    };

    private static IEnumerable<(string, InvoiceDto)> Samples()
    {
        var now = DateTime.Now;
        var date = now.ToString("yyyy-MM-dd");
        var time = now.ToString("HH:mm:ss");

        // 1) مبسطة: صنف سعره 300 شامل (= 260.87 قبل الضريبة) × 2 مع خصم + صنف صفري
        yield return ("simplified-invoice", new InvoiceDto
        {
            Id = "TEST-0001", Uuid = Guid.NewGuid().ToString(), IssueDate = date, IssueTime = time,
            Kind = "simplified", DocumentType = "invoice", Seller = Seller(), PaymentMeansCode = "10",
            Lines = new()
            {
                new InvoiceLineDto { Name = "صنف تجريبي", Quantity = 2, UnitPrice = 260.869565m, Discount = 52.17m, TaxCategory = "S", TaxPercent = 15 },
                new InvoiceLineDto { Name = "دواء", Quantity = 1, UnitPrice = 50m, TaxCategory = "Z", TaxPercent = 0,
                    ExemptionReasonCode = "VATEX-SA-35", ExemptionReason = "Medicines and medical equipment" },
            },
        });

        // 2) إشعار دائن مبسط (مرتجع)
        yield return ("simplified-credit-note", Note("TEST-0002", "simplified", "credit", "TEST-0001", null));

        // 3) إشعار مدين مبسط (زيادة سعر)
        yield return ("simplified-debit-note", Note("TEST-0003", "simplified", "debit", "TEST-0001", null));

        // 4) ضريبية (شركة) - تحتاج بيانات المشتري
        yield return ("standard-invoice", new InvoiceDto
        {
            Id = "TEST-0004", Uuid = Guid.NewGuid().ToString(), IssueDate = date, IssueTime = time,
            Kind = "standard", DocumentType = "invoice", Seller = Seller(), Buyer = Buyer(), PaymentMeansCode = "42",
            Lines = new()
            {
                new InvoiceLineDto { Name = "خدمة", Quantity = 3, UnitPrice = 100m, Discount = 30m, TaxCategory = "S", TaxPercent = 15 },
            },
        });

        // 5) إشعار دائن ضريبي
        yield return ("standard-credit-note", Note("TEST-0005", "standard", "credit", "TEST-0004", Buyer()));

        // 6) إشعار مدين ضريبي
        yield return ("standard-debit-note", Note("TEST-0006", "standard", "debit", "TEST-0004", Buyer()));

        InvoiceDto Note(string id, string kind, string type, string reference, PartyDto? buyer) => new()
        {
            Id = id, Uuid = Guid.NewGuid().ToString(), IssueDate = date, IssueTime = time,
            Kind = kind, DocumentType = type, BillingReference = reference,
            Reason = type == "credit"
                ? "In case of goods or services refund | عند ترجيع السلع أو الخدمات"
                : "Price adjustment | تعديل سعر",
            Seller = Seller(), Buyer = buyer,
            Lines = new() { new InvoiceLineDto { Name = "صنف تجريبي", Quantity = 1, UnitPrice = 100m, TaxCategory = "S", TaxPercent = 15 } },
        };
    }

    private static PartyDto Buyer() => new()
    {
        Name = "شركة نماذج فاتورة المحدودة | Fatoora Samples LTD",
        VatNumber = "399999999800003",
        Address = new AddressDto
        {
            Street = "صلاح الدين | Salah Al-Din", BuildingNumber = "1111", District = "المروج | Al-Murooj",
            City = "الرياض | Riyadh", PostalCode = "12222",
        },
    };
}

/// <summary>تسخين الـ SDK عند التشغيل (أول نداء لـ IKVM بياخد ثواني)</summary>
public sealed class WarmupService : BackgroundService
{
    private readonly SelfTest _test;
    private readonly ILogger<WarmupService> _log;

    public WarmupService(SelfTest test, ILogger<WarmupService> log)
    {
        _test = test;
        _log = log;
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken) => Task.Run(() =>
    {
        try
        {
            var started = DateTime.UtcNow;
            _test.Run(validate: false);
            _log.LogInformation("ZATCA SDK warmed up in {Ms} ms (rules found: {Rules})",
                (int)(DateTime.UtcNow - started).TotalMilliseconds, ZatcaSdk.RulesFound);
        }
        catch (Exception ex)
        {
            _log.LogWarning("ZATCA SDK warm-up failed: {Message}", ex.Message);
        }
    }, stoppingToken);
}
