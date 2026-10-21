using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ZatcaGateway.Models;

namespace ZatcaGateway.Services;

// ============================================================
// الاتصال ببوابة فاتورة (APIs الهيئة - الإصدار V2)
//   POST  /compliance                    شهادة الامتثال (CSR + OTP)
//   POST  /compliance/invoices           فحص الامتثال
//   POST  /production/csids              شهادة الإنتاج
//   PATCH /production/csids              تجديد شهادة الإنتاج (CSR + OTP)
//   POST  /invoices/reporting/single     إبلاغ (مبسطة)
//   POST  /invoices/clearance/single     اعتماد (ضريبية)
// ============================================================
public sealed class FatooraClient
{
    private readonly HttpClient _http;
    private readonly GatewayOptions _options;
    private readonly ILogger<FatooraClient> _log;

    public FatooraClient(HttpClient http, IOptions<GatewayOptions> options, ILogger<FatooraClient> log)
    {
        _http = http;
        _options = options.Value;
        _log = log;
    }

    private string BaseUrl(string env)
    {
        var e = ZatcaEnv.Normalize(env);
        return (_options.BaseUrls.TryGetValue(e, out var url) && !string.IsNullOrWhiteSpace(url)
            ? url
            : ZatcaEnv.DefaultBaseUrl(e)).TrimEnd('/');
    }

    private sealed record RawResponse(int Status, string Body, JsonElement? Json, bool NetworkError, string? NetworkMessage);

    private async Task<RawResponse> Send(
        HttpMethod method, string env, string path, object body,
        string? otp = null, (string Token, string Secret)? auth = null,
        string? language = null, string? clearanceStatus = null, CancellationToken ct = default)
    {
        var url = BaseUrl(env) + path;
        using var req = new HttpRequestMessage(method, url);
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        req.Headers.Add("Accept-Version", "V2");
        req.Headers.Add("Accept-Language", string.IsNullOrWhiteSpace(language) ? _options.Language : language);
        if (otp != null) req.Headers.Add("OTP", otp.Trim());
        if (clearanceStatus != null) req.Headers.Add("Clearance-Status", clearanceStatus);
        if (auth is { } a)
        {
            var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{a.Token}:{a.Secret}"));
            req.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);
        }
        var payload = body as string ?? JsonSerializer.Serialize(body);
        req.Content = new StringContent(payload, Encoding.UTF8, "application/json");

        try
        {
            using var res = await _http.SendAsync(req, ct);
            var text = await res.Content.ReadAsStringAsync(ct);
            _log.LogInformation("ZATCA {Method} {Path} [{Env}] -> {Status}", method, path, env, (int)res.StatusCode);
            return new RawResponse((int)res.StatusCode, text, JsonUtil.Parse(text), false, null);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _log.LogWarning("ZATCA {Method} {Path} [{Env}] network error: {Message}", method, path, env, ex.Message);
            return new RawResponse(0, "", null, true, ex.Message);
        }
    }

    private static (string Token, string Secret) Auth(Credentials c)
    {
        var (_, token) = CertificateUtil.Normalize(c.Certificate);
        if (string.IsNullOrWhiteSpace(c.Secret))
            throw new GatewayException("SecretRequired", "Certificate secret is required");
        return (token, c.Secret.Trim());
    }

    // ------------------------------------------------------------
    // الشهادات
    // ------------------------------------------------------------
    public async Task<CsidResponse> ComplianceCsid(ComplianceCsidRequest r, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(r.Csr)) throw new GatewayException("CsrRequired", "CSR is required");
        if (string.IsNullOrWhiteSpace(r.Otp)) throw new GatewayException("OtpRequired", "OTP is required");
        var raw = await Send(HttpMethod.Post, r.Environment, "/compliance", new { csr = r.Csr.Trim() },
            otp: r.Otp, language: r.Language, ct: ct);
        return ToCsid(raw);
    }

    public async Task<CsidResponse> ProductionCsid(ProductionCsidRequest r, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(r.ComplianceRequestId))
            throw new GatewayException("RequestIdRequired", "Compliance request id is required");
        var raw = await Send(HttpMethod.Post, r.Environment, "/production/csids",
            new { compliance_request_id = r.ComplianceRequestId.Trim() },
            auth: Auth(r.Credentials), language: r.Language, ct: ct);
        return ToCsid(raw);
    }

    public async Task<CsidResponse> RenewProductionCsid(RenewCsidRequest r, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(r.Csr)) throw new GatewayException("CsrRequired", "CSR is required");
        if (string.IsNullOrWhiteSpace(r.Otp)) throw new GatewayException("OtpRequired", "OTP is required");
        var raw = await Send(HttpMethod.Patch, r.Environment, "/production/csids", new { csr = r.Csr.Trim() },
            otp: r.Otp, auth: Auth(r.Credentials), language: r.Language, ct: ct);
        return ToCsid(raw);
    }

    private static CsidResponse ToCsid(RawResponse raw)
    {
        if (raw.NetworkError)
            return new CsidResponse(false, 0, null, null, null, null, null,
                new List<ZatcaMessage> { new("ERROR", "NETWORK", null, raw.NetworkMessage, null) }, null);

        var j = raw.Json;
        string? Str(string name) =>
            j is { ValueKind: JsonValueKind.Object } o && o.TryGetProperty(name, out var v)
                ? (v.ValueKind == JsonValueKind.String ? v.GetString() : v.ValueKind == JsonValueKind.Null ? null : v.ToString())
                : null;

        var token = Str("binarySecurityToken");
        var ok = raw.Status is >= 200 and < 300 && !string.IsNullOrWhiteSpace(token);
        var errors = ReadMessages(j, "errors");
        if (!ok && errors.Count == 0)
            errors.Add(new ZatcaMessage("ERROR", raw.Status.ToString(), null,
                Str("message") ?? Str("dispositionMessage") ?? (raw.Body.Length > 500 ? raw.Body[..500] : raw.Body), null));

        return new CsidResponse(ok, raw.Status, Str("requestID"), token, Str("secret"), Str("dispositionMessage"),
            ok ? CertificateUtil.TryInfo(token) : null, errors, j);
    }

    // ------------------------------------------------------------
    // الفواتير
    // ------------------------------------------------------------
    /// <summary>mode: reporting | clearance | compliance</summary>
    public async Task<SubmitResponse> SubmitInvoice(
        string env, string mode, string requestJson, string hash, string uuid,
        Credentials credentials, string? language, CancellationToken ct)
    {
        var auth = Auth(credentials);
        var (path, clearance) = mode.ToLowerInvariant() switch
        {
            "reporting" => ("/invoices/reporting/single", "0"),
            "clearance" => ("/invoices/clearance/single", "1"),
            "compliance" => ("/compliance/invoices", (string?)null),
            _ => throw new GatewayException("InvalidMode", "mode must be reporting | clearance"),
        };
        var raw = await Send(HttpMethod.Post, env, path, requestJson, auth: auth,
            language: language, clearanceStatus: clearance, ct: ct);
        return ToSubmit(raw, hash, uuid);
    }

    private static SubmitResponse ToSubmit(RawResponse raw, string hash, string uuid)
    {
        if (raw.NetworkError)
            return new SubmitResponse(false, "NETWORK_ERROR", 0, true, new(),
                new List<ZatcaMessage> { new("ERROR", "NETWORK", null, raw.NetworkMessage, null) },
                hash, uuid, null, null, null);

        var j = raw.Json;
        string? Str(string name) =>
            j is { ValueKind: JsonValueKind.Object } o && o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
                ? v.GetString()
                : null;

        JsonElement? validation = j is { ValueKind: JsonValueKind.Object } root && root.TryGetProperty("validationResults", out var vr)
            ? vr
            : null;
        var warnings = ReadMessages(validation, "warningMessages");
        var errors = ReadMessages(validation, "errorMessages");
        errors.AddRange(ReadMessages(j, "errors"));

        var reporting = Str("reportingStatus");
        var clearance = Str("clearanceStatus");
        var vStatus = validation is { ValueKind: JsonValueKind.Object } vo && vo.TryGetProperty("status", out var s) ? s.GetString() : null;
        var status = clearance ?? reporting ?? vStatus ?? (raw.Status == 401 ? "UNAUTHORIZED" : "ERROR");

        var accepted = raw.Status is 200 or 202
            && (reporting == "REPORTED" || clearance == "CLEARED" || (reporting == null && clearance == null && vStatus is "PASS" or "WARNING"));

        // 429 / 5xx = الهيئة مش متاحة دلوقتي → نعيد المحاولة بعدين
        var retryable = raw.Status == (int)HttpStatusCode.TooManyRequests || raw.Status >= 500;

        if (!accepted && errors.Count == 0 && raw.Status is not (200 or 202))
            errors.Add(new ZatcaMessage("ERROR", raw.Status.ToString(), null,
                Str("message") ?? (raw.Body.Length > 500 ? raw.Body[..500] : raw.Body), null));

        string? clearedXml = Str("clearedInvoice");
        string? qr = null;
        if (!string.IsNullOrWhiteSpace(clearedXml))
        {
            try
            {
                qr = ZatcaSdk.ExtractQr(Encoding.UTF8.GetString(Convert.FromBase64String(clearedXml)));
            }
            catch (FormatException)
            {
            }
        }

        return new SubmitResponse(accepted, status, raw.Status, retryable, warnings, errors, hash, uuid, clearedXml, qr, j);
    }

    private static List<ZatcaMessage> ReadMessages(JsonElement? parent, string name)
    {
        var list = new List<ZatcaMessage>();
        if (parent is not { ValueKind: JsonValueKind.Object } p || !p.TryGetProperty(name, out var arr)) return list;
        if (arr.ValueKind != JsonValueKind.Array)
        {
            if (arr.ValueKind == JsonValueKind.String) list.Add(new ZatcaMessage("ERROR", null, null, arr.GetString(), null));
            return list;
        }
        foreach (var m in arr.EnumerateArray())
        {
            if (m.ValueKind == JsonValueKind.String)
            {
                list.Add(new ZatcaMessage("ERROR", null, null, m.GetString(), null));
                continue;
            }
            if (m.ValueKind != JsonValueKind.Object) continue;
            string? F(string k) => m.TryGetProperty(k, out var v) && v.ValueKind != JsonValueKind.Null ? v.ToString() : null;
            list.Add(new ZatcaMessage(F("type"), F("code"), F("category"), F("message"), F("status")));
        }
        return list;
    }
}
