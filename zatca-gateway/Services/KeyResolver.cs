using System.Reflection;

namespace ZatcaGateway.Services;

// ============================================================
// البحث عن المفتاح المشترك مع Next.js بدون أي إعداد يدوي:
// 1) متغير البيئة ZATCA_GATEWAY_KEY
// 2) ملف .env بتاع المشروع (ZATCA_GATEWAY_KEY=...)
// 3) ملف .zatca/gateway.key اللي المشروع بيعمله تلقائياً أول مرة
// البحث بيبدأ من فولدر البرنامج والفولدر الحالي ويطلع لفوق لحد جذر القرص
// ============================================================
public static class KeyResolver
{
    public static string? Resolve()
    {
        var env = Environment.GetEnvironmentVariable("ZATCA_GATEWAY_KEY");
        if (!string.IsNullOrWhiteSpace(env)) return env.Trim();

        foreach (var dir in Candidates())
        {
            var fromEnv = ReadEnvFile(Path.Combine(dir, ".env"));
            if (!string.IsNullOrWhiteSpace(fromEnv)) return fromEnv;
            var keyFile = Path.Combine(dir, ".zatca", "gateway.key");
            if (File.Exists(keyFile))
            {
                var k = File.ReadAllText(keyFile).Trim();
                if (k.Length > 0) return k;
            }
        }
        return null;
    }

    private static IEnumerable<string> Candidates()
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var start in new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() })
        {
            var d = new DirectoryInfo(start);
            while (d != null)
            {
                if (seen.Add(d.FullName)) yield return d.FullName;
                d = d.Parent;
            }
        }
    }

    private static string? ReadEnvFile(string path)
    {
        if (!File.Exists(path)) return null;
        foreach (var raw in File.ReadAllLines(path))
        {
            var line = raw.Trim();
            if (!line.StartsWith("ZATCA_GATEWAY_KEY", StringComparison.Ordinal)) continue;
            var i = line.IndexOf('=');
            if (i < 0 || line[..i].Trim() != "ZATCA_GATEWAY_KEY") continue;
            var v = line[(i + 1)..].Trim().Trim('"', '\'');
            return v.Length > 0 ? v : null;
        }
        return null;
    }

    /// <summary>وقت بناء البرنامج (ثواني Unix) = وقت تعديل ملف الـ dll</summary>
    public static long BuildStamp()
    {
        try
        {
            var location = Assembly.GetEntryAssembly()?.Location;
            if (string.IsNullOrEmpty(location)) return 0;
            return new DateTimeOffset(File.GetLastWriteTimeUtc(location)).ToUnixTimeSeconds();
        }
        catch
        {
            return 0;
        }
    }
}
