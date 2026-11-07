// ============================================================
// وسيط الطباعة (InfoTech Print Agent) - ويندوز
// برنامج صغير بيشتغل في الخلفية على جهاز في المطعم:
// - بيتربط بالبرنامج مرة واحدة بكود الفرع (من شاشة الطباعة)
// - بيسأل السيرفر عن مهام الطباعة (long-poll) وبيطبعها على طول:
//   طابعات الشبكة بالـ IP (المنفذ 9100) | طابعات ويندوز (USB) بالاسم
// - التذكرة / الفاتورة جاية صورة (PNG) مرسومة في المتصفح ← بتتحول لأوامر ESC/POS
//   (العربي بيطلع سليم على أي طابعة حرارية)
// - بيبعت للسيرفر طابعات ويندوز اللي على الجهاز، ونتيجة الاختبار والبحث
// الأوامر: (من غير) = الإعداد أول مرة ثم التشغيل في الخلفية
//          --run تشغيل | --install تشغيل تلقائي مع ويندوز | --uninstall | --reset
// ============================================================
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const http = require("http");
const https = require("https");
const readline = require("readline");
const { spawn, execFile } = require("child_process");
const { PNG } = require("pngjs");

const VERSION = "1.0.0";
const APP = "InfoTechPrintAgent";
const DIR = path.join(process.env.APPDATA || os.homedir(), APP);
const CONFIG = path.join(DIR, "config.json");
const LOG = path.join(DIR, "agent.log");
const LOCK = path.join(DIR, "agent.lock");
const EXE = process.execPath;
const EXE_DIR = path.dirname(EXE);
// عرض الطباعة بالنقط (203dpi): 80mm ← 72mm = 576 | 58mm ← 48mm = 384
const DOTS = { "80mm": 576, "58mm": 384 };

fs.mkdirSync(DIR, { recursive: true });

// ---------------- السجل ----------------
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args
    .map((a) => (a instanceof Error ? a.stack || a.message : typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ")}\n`;
  try {
    // السجل مايكبرش عن 2MB
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 2 * 1024 * 1024)
      fs.renameSync(LOG, LOG + ".old");
    fs.appendFileSync(LOG, line);
  } catch {
    /* مش مهم */
  }
  if (process.stdout.isTTY) process.stdout.write(line);
}

const readConfig = () => {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  } catch {
    return null;
  }
};
const writeConfig = (c) => fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2));

// ---------------- HTTP ----------------
function request(cfg, method, url, body, timeoutMs = 40_000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url, cfg.serverUrl);
    const lib = u.protocol === "https:" ? https : http;
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = lib.request(
      u,
      {
        method,
        timeout: timeoutMs,
        headers: {
          "content-type": "application/json",
          ...(data ? { "content-length": data.length } : {}),
          ...(cfg.company ? { "x-company": cfg.company } : {}),
          ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            /* مش JSON */
          }
          if (res.statusCode >= 400) {
            const err = new Error(json?.error || `HTTP ${res.statusCode}`);
            err.status = res.statusCode;
            err.code = json?.error;
            return reject(err);
          }
          resolve(json);
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("Timeout")));
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// ---------------- ESC/POS ----------------
const ESC = 0x1b;
const GS = 0x1d;

// PNG ← صورة نقطية (أبيض وأسود) بعرض الطابعة ← أوامر GS v 0
function pngToEscPos(base64, paperSize) {
  const src = PNG.sync.read(Buffer.from(base64, "base64"));
  const target = DOTS[paperSize] || DOTS["80mm"];
  const scale = src.width / target;
  const width = target;
  const height = Math.max(1, Math.round(src.height / scale));
  const bytesPerRow = Math.ceil(width / 8);
  const bits = Buffer.alloc(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.floor(y * scale));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x * scale));
      const i = (sy * src.width + sx) * 4;
      const a = src.data[i + 3] / 255;
      // الشفاف = أبيض
      const lum =
        (0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2]) * a +
        255 * (1 - a);
      if (lum < 160) bits[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  // قص المساحة البيضا اللي تحت
  let last = height - 1;
  outer: for (; last > 0; last--) {
    for (let b = 0; b < bytesPerRow; b++) if (bits[last * bytesPerRow + b]) break outer;
  }
  const rows = last + 1;
  const parts = [];
  // شرايح 256 سطر (بعض الطابعات بتقف مع الصور الطويلة)
  for (let y0 = 0; y0 < rows; y0 += 256) {
    const h = Math.min(256, rows - y0);
    parts.push(
      Buffer.from([GS, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, h & 0xff, h >> 8]),
      bits.subarray(y0 * bytesPerRow, (y0 + h) * bytesPerRow),
    );
  }
  return Buffer.concat(parts);
}

function wrapJob(body, { autoCut = true, beep = false, copies = 1 } = {}) {
  const one = Buffer.concat([
    Buffer.from([ESC, 0x40]), // تهيئة
    body,
    Buffer.from([ESC, 0x64, 0x04]), // سطور فاضية قبل القص
    ...(autoCut ? [Buffer.from([GS, 0x56, 0x42, 0x00])] : []),
  ]);
  const all = [];
  for (let i = 0; i < Math.max(1, copies); i++) all.push(one);
  // صوت التنبيه (ESC B n t) - أغلب الطابعات الحرارية
  if (beep) all.push(Buffer.from([ESC, 0x42, 0x03, 0x02]));
  return Buffer.concat(all);
}

function testBody(job) {
  const lines = [
    "================================",
    "   InfoTech Print Agent - TEST",
    "================================",
    `Printer: ${job.title && job.title !== "test" ? job.title : job.targetHost || job.windowsName || ""}`,
    `Time: ${new Date().toLocaleString("en-GB")}`,
    `Agent: ${os.hostname()} v${VERSION}`,
    "",
    "Printing works - OK",
    "",
  ];
  return Buffer.from(lines.join("\n") + "\n", "ascii");
}

// ---------------- الإرسال للطابعة ----------------
function sendNetwork(host, port, data, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host, port: port || 9100 });
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      sock.destroy();
      err ? reject(err) : resolve();
    };
    sock.setTimeout(timeoutMs, () => finish(new Error(`No response from ${host}:${port || 9100}`)));
    sock.on("error", (e) => finish(new Error(`${host}:${port || 9100} - ${e.code || e.message}`)));
    sock.on("connect", () => {
      sock.write(data, () => {
        sock.end();
        // الطابعة بتقفل الاتصال بعد ما تستلم
        setTimeout(() => finish(), 300);
      });
    });
  });
}

// طابعة ويندوز (USB) بالاسم: إرسال RAW عن طريق winspool (PowerShell + C#)
const RAW_PS = `
param([string]$printer, [string]$file)
$code = @'
using System; using System.Runtime.InteropServices;
public class RawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern int StartDocPrinter(IntPtr h, int l, DOCINFO d);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int c, out int w);
  public static void Send(string printer, byte[] bytes) {
    IntPtr h; if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("Printer not found: " + printer);
    try {
      var di = new DOCINFO(); di.pDocName = "InfoTech"; di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, di) == 0) throw new Exception("StartDoc failed");
      StartPagePrinter(h); int w; WritePrinter(h, bytes, bytes.Length, out w); EndPagePrinter(h); EndDocPrinter(h);
    } finally { ClosePrinter(h); }
  }
}
'@
Add-Type -TypeDefinition $code
[RawPrint]::Send($printer, [System.IO.File]::ReadAllBytes($file))
`;

function sendWindows(printer, data) {
  return new Promise((resolve, reject) => {
    const file = path.join(os.tmpdir(), `infotech-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
    const script = path.join(DIR, "rawprint.ps1");
    try {
      fs.writeFileSync(file, data);
      if (!fs.existsSync(script) || fs.readFileSync(script, "utf8") !== RAW_PS)
        fs.writeFileSync(script, RAW_PS);
    } catch (e) {
      return reject(e);
    }
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-printer", printer, "-file", file],
      { windowsHide: true, timeout: 30_000 },
      (err, _out, stderr) => {
        fs.rm(file, () => {});
        if (err) return reject(new Error((stderr || err.message).trim().split("\n").slice(-2).join(" ")));
        resolve();
      },
    );
  });
}

function sendToPrinter(job, data) {
  if (job.connection === "windows") return sendWindows(job.windowsName, data);
  return sendNetwork(job.targetHost, job.targetPort, data);
}

// ---------------- طابعات ويندوز ----------------
function listWindowsPrinters() {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"],
      { windowsHide: true, timeout: 20_000 },
      (err, out) => {
        if (err) return resolve([]);
        resolve(
          String(out)
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean),
        );
      },
    );
  });
}

// ---------------- اختبار الاتصال والبحث ----------------
function probe(host, port = 9100, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    const t0 = Date.now();
    let done = false;
    const end = (ok, error) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve({ ok, ms: Date.now() - t0, error });
    };
    sock.setTimeout(timeoutMs, () => end(false, "Timeout"));
    sock.on("error", (e) => end(false, e.code || e.message));
    sock.on("connect", () => end(true));
  });
}

// كل الشبكات المحلية (/24) على المنفذ 9100
async function scanNetwork(port = 9100) {
  const subnets = new Set();
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list || [])
      if (a.family === "IPv4" && !a.internal) subnets.add(a.address.split(".").slice(0, 3).join("."));
  const hosts = [];
  for (const s of subnets) for (let i = 1; i < 255; i++) hosts.push(`${s}.${i}`);
  const found = [];
  let next = 0;
  const worker = async () => {
    while (next < hosts.length) {
      const h = hosts[next++];
      const r = await probe(h, port, 600);
      if (r.ok) found.push({ host: h, port });
    }
  };
  await Promise.all(Array.from({ length: 64 }, worker));
  found.sort((a, b) => Number(a.host.split(".")[3]) - Number(b.host.split(".")[3]));
  return { found, subnets: [...subnets] };
}

// ---------------- تنفيذ مهمة ----------------
async function runJob(job) {
  if (job.jobKind === "probe") {
    const r = await probe(job.targetHost, job.targetPort || 9100);
    if (!r.ok) throw new Error(`${job.targetHost}:${job.targetPort || 9100} - ${r.error}`);
    return { ms: r.ms };
  }
  if (job.jobKind === "scan") return scanNetwork(job.targetPort || 9100);
  if (job.jobKind === "test") {
    await sendToPrinter(job, wrapJob(testBody(job), { autoCut: true }));
    return { ok: true };
  }
  // print: صورة التذكرة / الفاتورة
  if (!job.imageData) throw new Error("No image");
  const body = pngToEscPos(job.imageData, job.paperSize);
  await sendToPrinter(job, wrapJob(body, job));
  return { ok: true };
}

async function report(cfg, job, ok, error, result) {
  for (let i = 0; i < 3; i++) {
    try {
      await request(cfg, "POST", `/api/print-agent/jobs/${job.id}`, { ok, error, result }, 15_000);
      return;
    } catch (e) {
      log("report failed", job.id, e.message);
      await sleep(1000 * (i + 1));
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- الحلقة الأساسية ----------------
async function heartbeat(cfg) {
  try {
    const printers = process.platform === "win32" ? await listWindowsPrinters() : [];
    await request(cfg, "POST", "/api/print-agent/heartbeat", {
      printers,
      version: VERSION,
      hostName: os.hostname(),
    }, 15_000);
  } catch (e) {
    log("heartbeat failed:", e.message);
    if (e.status === 401) unauthorized();
  }
}

function unauthorized() {
  log("الجهاز اتلغى ربطه من البرنامج (Unauthorized). شغّل الوسيط تاني واربطه بكود جديد.");
  const cfg = readConfig();
  if (cfg) writeConfig({ ...cfg, token: null });
  process.exit(2);
}

async function runLoop() {
  const cfg = readConfig();
  if (!cfg?.token) {
    log("مش مربوط. شغّل الوسيط من غير أوامر عشان تربطه.");
    process.exit(1);
  }
  lockOrExit();
  log(`الوسيط شغال v${VERSION} ← ${cfg.serverUrl} (${cfg.company})`);
  heartbeat(cfg);
  setInterval(() => heartbeat(cfg), 30_000);
  let backoff = 1000;
  for (;;) {
    try {
      const res = await request(cfg, "GET", "/api/print-agent/jobs?wait=25000", null, 40_000);
      backoff = 1000;
      const jobs = res?.jobs ?? [];
      if (!jobs.length) continue;
      // كل طابعة على حدة بالترتيب (الأولوية)، والطابعات المختلفة مع بعض (أسرع)
      const groups = new Map();
      for (const j of jobs) {
        const key = j.connection === "windows" ? `w:${j.windowsName}` : `n:${j.targetHost}:${j.targetPort}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(j);
      }
      await Promise.all(
        [...groups.values()].map(async (list) => {
          for (const job of list) {
            const t0 = Date.now();
            try {
              const result = await runJob(job);
              log(`✓ ${job.jobKind} #${job.id} ${job.title || ""} (${Date.now() - t0}ms)`);
              await report(cfg, job, true, null, result);
            } catch (e) {
              log(`✗ ${job.jobKind} #${job.id} ${job.title || ""}: ${e.message}`);
              await report(cfg, job, false, e.message, null);
            }
          }
        }),
      );
    } catch (e) {
      if (e.status === 401) unauthorized();
      log("connection:", e.message, `(retry in ${backoff / 1000}s)`);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 30_000);
    }
  }
}

// نسخة واحدة بس شغالة
function lockOrExit() {
  try {
    const pid = Number(fs.readFileSync(LOCK, "utf8"));
    if (pid && pid !== process.pid) {
      try {
        process.kill(pid, 0);
        log("الوسيط شغال بالفعل (pid " + pid + ").");
        process.exit(0);
      } catch {
        /* النسخة القديمة مقفولة */
      }
    }
  } catch {
    /* مفيش قفل */
  }
  fs.writeFileSync(LOCK, String(process.pid));
  process.on("exit", () => {
    try {
      if (Number(fs.readFileSync(LOCK, "utf8")) === process.pid) fs.rmSync(LOCK);
    } catch {
      /* مش مهم */
    }
  });
}

// ---------------- التشغيل التلقائي مع ويندوز ----------------
// مهمة مجدولة عند الدخول بتشغّل الوسيط مخفي (من غير شاشة سودا)
const VBS = path.join(DIR, "start-hidden.vbs");
function install() {
  fs.writeFileSync(
    VBS,
    `CreateObject("WScript.Shell").Run """${EXE}"" --run", 0, False\r\n`,
  );
  return new Promise((resolve) => {
    execFile(
      "schtasks",
      ["/Create", "/F", "/SC", "ONLOGON", "/TN", APP, "/TR", `wscript.exe "${VBS}"`, "/RL", "LIMITED"],
      { windowsHide: true },
      (err, out, stderr) => {
        if (err) log("install failed:", (stderr || err.message).trim());
        else log("اتسجل التشغيل التلقائي مع ويندوز.");
        resolve(!err);
      },
    );
  });
}
function uninstall() {
  return new Promise((resolve) =>
    execFile("schtasks", ["/Delete", "/F", "/TN", APP], { windowsHide: true }, () => {
      log("اتشال التشغيل التلقائي.");
      resolve();
    }),
  );
}
function startHidden() {
  spawn("wscript.exe", [VBS], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

// ---------------- الإعداد أول مرة ----------------
function ask(rl, q) {
  return new Promise((r) => rl.question(q, (a) => r(a.trim())));
}

// ملف الإعداد الجاهز جنب البرنامج (من «تحميل جاهز للفرع»)
function setupFile() {
  for (const name of ["agent-setup.json", "InfoTech-Print-Agent.json"]) {
    try {
      return JSON.parse(fs.readFileSync(path.join(EXE_DIR, name), "utf8"));
    } catch {
      /* مش موجود */
    }
  }
  return null;
}

async function setup() {
  const preset = setupFile();
  let serverUrl = preset?.serverUrl;
  let pairCode = preset?.pairCode;
  let rl = null;
  if (!serverUrl || !pairCode) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log("\n=== InfoTech Print Agent - الإعداد أول مرة ===\n");
    console.log("الكود موجود في البرنامج: المطعم ← الطباعة ← وسيط الطباعة\n");
    if (!serverUrl) serverUrl = await ask(rl, "رابط البرنامج (مثال https://erp.example.com): ");
    if (!pairCode) pairCode = await ask(rl, "كود الربط (مثال main-AB12CD34): ");
  }
  serverUrl = serverUrl.replace(/\/+$/, "");
  const cut = pairCode.lastIndexOf("-");
  if (cut < 1) throw new Error("كود الربط غير صحيح");
  const company = pairCode.slice(0, cut);
  const key = pairCode.slice(cut + 1);
  const name = preset?.name || os.hostname();
  const cfgBase = { serverUrl, company: company === "main" ? null : company };
  log("جاري الربط بـ", serverUrl, "...");
  const res = await request(cfgBase, "POST", "/api/print-agent/pair", {
    key,
    name,
    hostName: os.hostname(),
    version: VERSION,
  }, 20_000);
  writeConfig({ ...cfgBase, token: res.token, agentId: res.agent.id, branch: res.branch });
  log(`اتربط بنجاح: ${res.agent.name} ← فرع ${res.branch.arName}`);
  if (rl) rl.close();
}

// ---------------- البداية ----------------
async function main() {
  const arg = process.argv[2];
  if (arg === "--run") return runLoop();
  if (arg === "--install") return void (await install());
  if (arg === "--uninstall") return void (await uninstall());
  if (arg === "--reset") {
    try {
      fs.rmSync(CONFIG);
    } catch {
      /* مفيش */
    }
    return log("اتمسح الربط.");
  }
  // تشغيل عادي (دبل كليك): الإعداد لو مش مربوط ← التشغيل التلقائي ← تشغيل في الخلفية
  try {
    if (!readConfig()?.token) await setup();
    if (process.platform === "win32") {
      await install();
      startHidden();
      console.log("\nالوسيط شغال دلوقتي في الخلفية، وهيشتغل لوحده مع ويندوز.");
      console.log("تقدر تقفل الشاشة دي. السجل: " + LOG);
      await sleep(4000);
      process.exit(0);
    }
    return runLoop();
  } catch (e) {
    log("خطأ:", e.code || e.message);
    console.log("\nحصل خطأ: " + (e.code || e.message));
    console.log("اتأكد من الرابط وكود الربط، وإن البرنامج شغال.");
    await sleep(8000);
    process.exit(1);
  }
}

main();
