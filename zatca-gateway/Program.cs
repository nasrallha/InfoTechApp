using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Extensions.Options;
using ZatcaGateway.Models;
using ZatcaGateway.Services;

// ============================================================
// ZATCA Gateway - نقطة التشغيل
// كل الـ endpoints (ما عدا /health) محتاجة الهيدر X-Gateway-Key
// ============================================================

// الـ SDK بيدور على فولدر Rules، ولما تشتغل كـ Windows Service المجلد الحالي بيبقى System32
Directory.SetCurrentDirectory(AppContext.BaseDirectory);

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory,
});

// إعدادات محلية اختيارية (مش بتترفع على git)
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: false);
builder.Host.UseWindowsService(o => o.ServiceName = "ZatcaGateway");
builder.Host.UseSystemd();

var section = builder.Configuration.GetSection("Gateway");
builder.Services.Configure<GatewayOptions>(section);
builder.Services.PostConfigure<GatewayOptions>(o =>
{
    // المفتاح المشترك مع Next.js (لو مش متحدد في الإعدادات):
    // متغير ZATCA_GATEWAY_KEY ← ملف .env بتاع المشروع ← ملف .zatca/gateway.key (بيعمله المشروع تلقائياً)
    if (string.IsNullOrWhiteSpace(o.ApiKey))
        o.ApiKey = KeyResolver.Resolve() ?? "";
});
var urls = section.GetValue<string>("Urls") ?? "http://127.0.0.1:5089";
builder.WebHost.UseUrls(urls);

builder.Services.AddSingleton<ZatcaSdk>();
builder.Services.AddSingleton<InvoiceXmlBuilder>();
builder.Services.AddSingleton<SelfTest>();
builder.Services.AddHttpClient<FatooraClient>((sp, c) =>
{
    var o = sp.GetRequiredService<IOptions<GatewayOptions>>().Value;
    c.Timeout = TimeSpan.FromSeconds(Math.Clamp(o.ZatcaTimeoutSeconds, 5, 120));
});
builder.Services.AddHostedService<WarmupService>();

var app = builder.Build();
var options = app.Services.GetRequiredService<IOptions<GatewayOptions>>().Value;
if (string.IsNullOrWhiteSpace(options.ApiKey))
    app.Logger.LogWarning("Gateway:ApiKey (or ZATCA_GATEWAY_KEY) is not set - all requests will be rejected");

// ------------------------------------------------------------
// الأخطاء: GatewayException → 400 بكود واضح، غير كده → 500
// ------------------------------------------------------------
app.UseExceptionHandler(err => err.Run(async ctx =>
{
    var ex = ctx.Features.Get<IExceptionHandlerFeature>()?.Error;
    ctx.Response.ContentType = "application/json";
    if (ex is GatewayException g)
    {
        ctx.Response.StatusCode = 400;
        await ctx.Response.WriteAsJsonAsync(new { error = g.Code, message = g.Message, details = g.Details });
        return;
    }
    if (ex is BadHttpRequestException bad)
    {
        ctx.Response.StatusCode = 400;
        await ctx.Response.WriteAsJsonAsync(new { error = "BadRequest", message = bad.Message });
        return;
    }
    app.Logger.LogError(ex, "Unhandled error");
    ctx.Response.StatusCode = 500;
    await ctx.Response.WriteAsJsonAsync(new { error = "GatewayError", message = ex?.Message });
}));

// ------------------------------------------------------------
// الحماية: مفتاح مشترك
// ------------------------------------------------------------
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path.StartsWithSegments("/health"))
    {
        await next();
        return;
    }
    var expected = options.ApiKey;
    var given = ctx.Request.Headers["X-Gateway-Key"].ToString();
    if (string.IsNullOrEmpty(expected) || !CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(given), Encoding.UTF8.GetBytes(expected)))
    {
        ctx.Response.StatusCode = 401;
        await ctx.Response.WriteAsJsonAsync(new { error = "Unauthorized", message = "Invalid X-Gateway-Key" });
        return;
    }
    await next();
});

// ------------------------------------------------------------
// Endpoints
// ------------------------------------------------------------
app.MapGet("/health", () => Results.Ok(new
{
    ok = true,
    service = "ZatcaGateway",
    // وقت بناء البرنامج (المشروع بيقارنه عشان يعيد التشغيل بعد التحديث)
    build = KeyResolver.BuildStamp(),
    sdkVersion = ZatcaSdk.SdkVersion,
    rulesFound = ZatcaSdk.RulesFound,
    os = System.Runtime.InteropServices.RuntimeInformation.OSDescription,
    time = DateTime.UtcNow,
}));

// التأكد من المفتاح المشترك (المشروع بيستخدمه قبل ما يعتمد على خدمة شغالة)
app.MapPost("/auth-check", () => Results.Ok(new { ok = true }));

// إيقاف الخدمة (المشروع بيستخدمه عشان يشغّل النسخة الجديدة بعد التحديث)
app.MapPost("/shutdown", (IHostApplicationLifetime life) =>
{
    _ = Task.Run(async () =>
    {
        await Task.Delay(300);
        life.StopApplication();
    });
    return Results.Ok(new { ok = true });
});

// اختبار ذاتي بدون إنترنت (بناء + توقيع + تحقق بشهادة الـ SDK التجريبية)
app.MapPost("/selftest", (SelfTest test) => Results.Ok(test.Run()));

// --- التسجيل ---
app.MapPost("/csr", (CsrRequest req, ZatcaSdk sdk) => Results.Ok(sdk.GenerateCsr(req)));

app.MapPost("/onboarding/compliance-csid", async (ComplianceCsidRequest req, FatooraClient z, CancellationToken ct) =>
    Results.Ok(await z.ComplianceCsid(req, ct)));

app.MapPost("/onboarding/compliance-check", async (
    ComplianceCheckRequest req, InvoiceXmlBuilder b, ZatcaSdk sdk, FatooraClient z, CancellationToken ct) =>
{
    var (xml, _) = b.Build(req.Invoice);
    var signed = sdk.Sign(xml, req.Credentials);
    var (json, hash, uuid) = sdk.BuildApiRequest(ZatcaSdk.DecodeBase64Xml(signed.Xml));
    var result = await z.SubmitInvoice(req.Environment, "compliance", json, hash, uuid, req.Credentials, req.Language, ct);
    return Results.Ok(new { result, signed = new { signed.Xml, signed.Hash, signed.Qr, signed.Uuid } });
});

app.MapPost("/onboarding/production-csid", async (ProductionCsidRequest req, FatooraClient z, CancellationToken ct) =>
    Results.Ok(await z.ProductionCsid(req, ct)));

app.MapPost("/onboarding/renew", async (RenewCsidRequest req, FatooraClient z, CancellationToken ct) =>
    Results.Ok(await z.RenewProductionCsid(req, ct)));

app.MapPost("/certificates/info", (CertificateInfoRequest req) => Results.Ok(CertificateUtil.Info(req.Certificate)));

// --- الفواتير ---
app.MapPost("/invoices/build", (BuildRequest req, InvoiceXmlBuilder b) =>
{
    var (xml, totals) = b.Build(req.Invoice);
    return Results.Ok(new { xml = ZatcaSdk.ToBase64(xml), totals });
});

app.MapPost("/invoices/sign", (SignRequest req, InvoiceXmlBuilder b, ZatcaSdk sdk) =>
{
    var (xml, totals) = b.Build(req.Invoice);
    var signed = sdk.Sign(xml, req.Credentials, req.Validate ? req.Invoice.Pih : null);
    return Results.Ok(new { signed.Xml, signed.Hash, signed.Qr, signed.Uuid, signed.Validation, totals });
});

app.MapPost("/invoices/validate", (ValidateRequest req, ZatcaSdk sdk) =>
    Results.Ok(sdk.Validate(ZatcaSdk.DecodeBase64Xml(req.Xml), req.Certificate, req.Pih)));

app.MapPost("/invoices/submit", async (SubmitRequest req, ZatcaSdk sdk, FatooraClient z, CancellationToken ct) =>
{
    var mode = (req.Mode ?? "").ToLowerInvariant();
    if (mode is not ("reporting" or "clearance"))
        throw new GatewayException("InvalidMode", "mode must be reporting | clearance");
    var (json, hash, uuid) = sdk.BuildApiRequest(ZatcaSdk.DecodeBase64Xml(req.Xml));
    return Results.Ok(await z.SubmitInvoice(req.Environment, mode, json, hash, uuid, req.Credentials, req.Language, ct));
});

// تشغيل الاختبار الذاتي من سطر الأوامر: dotnet ZatcaGateway.dll --selftest
if (args.Contains("--selftest"))
{
    var result = app.Services.GetRequiredService<SelfTest>().Run();
    Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(result,
        new System.Text.Json.JsonSerializerOptions { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));
    return;
}

app.Run();
