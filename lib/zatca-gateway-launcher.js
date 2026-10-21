import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getGatewayKey } from "./zatca-local";

// ============================================================
// تشغيل خدمة ZATCA Gateway تلقائياً مع البرنامج (من غير أي أمر يدوي)
// - أول ما السيرفر يقوم (instrumentation.js) بنتأكد إن الخدمة شغالة
// - لو مش شغالة: نبنيها (dotnet publish) لو محتاج، ونشغّلها كعملية تابعة للبرنامج
// - لو وقعت: بنعيد تشغيلها تلقائياً، ولو الكود اتحدث: بنشغّل النسخة الجديدة
// - بتقفل لما البرنامج يقفل
// المتطلبات على الجهاز: .NET 8 (SDK للبناء أول مرة، أو Runtime لو فولدر publish جاهز)
// إعدادات اختيارية في .env:
//   ZATCA_GATEWAY_URL=http://127.0.0.1:5089   (العنوان)
//   ZATCA_GATEWAY_AUTOSTART=false             (لو الخدمة شغالة بطريقة تانية)
//   ZATCA_GATEWAY_DIR=...                     (مكان النسخة المبنية)
// ============================================================

const ROOT = process.cwd();
const PROJECT_DIR = path.join(ROOT, "zatca-gateway");
const CSPROJ = path.join(PROJECT_DIR, "ZatcaGateway.csproj");
const PUBLISH_DIR =
  process.env.ZATCA_GATEWAY_DIR || path.join(PROJECT_DIR, "publish");
const DLL = path.join(PUBLISH_DIR, "ZatcaGateway.dll");
// وقت آخر بناء ناجح (للمقارنة مع وقت تعديل الكود)
const STAMP = path.join(PUBLISH_DIR, ".build-stamp");
const MAX_RESTARTS = 5;

// حالة واحدة للعملية كلها (حتى مع إعادة تحميل الكود في التطوير)
const state = (globalThis.__zatcaGateway ??= {
  child: null,
  starting: null,
  restarts: 0,
  lastError: null,
  exitHooked: false,
});

export const gatewayUrl = () =>
  (process.env.ZATCA_GATEWAY_URL || "http://127.0.0.1:5089").replace(
    /\/+$/,
    "",
  );

const isLocal = (url) => {
  try {
    return ["127.0.0.1", "localhost", "[::1]", "::1"].includes(
      new URL(url).hostname,
    );
  } catch {
    return false;
  }
};

export const autoStartEnabled = () =>
  process.env.ZATCA_GATEWAY_AUTOSTART !== "false" && isLocal(gatewayUrl());

export const launcherStatus = () => ({
  autoStart: autoStartEnabled(),
  starting: Boolean(state.starting),
  error: state.lastError,
});

const log = (...args) => console.log("[zatca-gateway]", ...args);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------
// حالة الخدمة: شغالة؟ بنفس المفتاح؟ نسخة البناء؟
// ------------------------------------------------------------
export async function probeGateway() {
  try {
    const res = await fetch(`${gatewayUrl()}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { online: false };
    const health = await res.json().catch(() => ({}));
    const auth = await fetch(`${gatewayUrl()}/auth-check`, {
      method: "POST",
      headers: { "X-Gateway-Key": getGatewayKey() },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return {
      online: true,
      authorized: auth.ok,
      build: health.build ?? null,
      sdkVersion: health.sdkVersion ?? null,
      rulesFound: health.rulesFound ?? null,
      os: health.os ?? null,
    };
  } catch {
    return { online: false };
  }
}

// ------------------------------------------------------------
// البناء
// ------------------------------------------------------------
function newestSourceTime(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["bin", "obj", "publish", "deploy"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestSourceTime(full));
    else if (/\.(cs|csproj|json)$/i.test(entry.name))
      newest = Math.max(newest, fs.statSync(full).mtimeMs);
  }
  return newest;
}

// محتاجين نبني؟ (مفيش نسخة مبنية، أو الكود أحدث منها)
function needsPublish() {
  if (!fs.existsSync(CSPROJ)) return false; // مفيش كود: نستخدم المبني زي ما هو
  if (!fs.existsSync(DLL) || !fs.existsSync(STAMP)) return true;
  return newestSourceTime(PROJECT_DIR) > fs.statSync(STAMP).mtimeMs;
}

const buildStamp = () =>
  fs.existsSync(DLL) ? Math.floor(fs.statSync(DLL).mtimeMs / 1000) : null;

function runCommand(cmd, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, ...options });
    let output = "";
    child.stdout?.on("data", (d) => (output += d));
    child.stderr?.on("data", (d) => (output += d));
    child.on("error", (error) => reject(error));
    child.on("exit", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(output.slice(-2000) || `exit code ${code}`)),
    );
  });
}

async function publish() {
  log("building the ZATCA service (first time may take a minute)...");
  await runCommand(
    "dotnet",
    ["publish", CSPROJ, "-c", "Release", "-o", PUBLISH_DIR, "--nologo"],
    { cwd: ROOT, env: process.env },
  );
  fs.writeFileSync(STAMP, new Date().toISOString());
  log("build finished");
}

// ------------------------------------------------------------
// التشغيل
// ------------------------------------------------------------
function hookExit() {
  if (state.exitHooked) return;
  state.exitHooked = true;
  process.once("exit", () => {
    state.stopping = true;
    state.child?.kill();
  });
}

function spawnGateway() {
  hookExit();
  const child = spawn("dotnet", [DLL], {
    cwd: PUBLISH_DIR,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      Gateway__ApiKey: getGatewayKey(),
      Gateway__Urls: gatewayUrl(),
      ASPNETCORE_ENVIRONMENT: "Production",
      DOTNET_NOLOGO: "1",
    },
  });
  const print = (d) =>
    String(d)
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .forEach((l) => log(l));
  child.stdout.on("data", print);
  child.stderr.on("data", print);
  child.on("error", (error) => {
    state.lastError = error.code === "ENOENT" ? "DotnetMissing" : "StartFailed";
    log("failed to start:", error.message);
  });
  child.on("exit", (code) => {
    if (state.child === child) state.child = null;
    if (state.stopping) return;
    log(`stopped (code ${code})`);
    // إعادة تشغيل تلقائية لو وقعت
    if (state.restarts < MAX_RESTARTS) {
      state.restarts += 1;
      setTimeout(
        () => ensureGateway({ wait: false }),
        5000 * state.restarts,
      ).unref?.();
    }
  });
  state.child = child;
}

async function waitOnline(timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const p = await probeGateway();
    if (p.online) return p;
    if (!state.child) break; // وقعت
    await sleep(1000);
  }
  return probeGateway();
}

async function stopRunning() {
  try {
    await fetch(`${gatewayUrl()}/shutdown`, {
      method: "POST",
      headers: { "X-Gateway-Key": getGatewayKey() },
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // ممكن تقفل قبل ما ترد
  }
  for (let i = 0; i < 20; i++) {
    if (!(await probeGateway()).online) return;
    await sleep(500);
  }
}

async function start() {
  let p = await probeGateway();
  const rebuild = needsPublish();
  const stamp = buildStamp();
  const upToDate = !rebuild && (!p.build || !stamp || p.build >= stamp);

  if (p.online && p.authorized && upToDate) {
    state.lastError = null;
    return p;
  }
  if (p.online && !p.authorized) {
    // خدمة تانية شغالة على نفس العنوان بمفتاح مختلف (مثلاً اتشغلت يدوي قبل كده)
    state.lastError = "KeyMismatch";
    return p;
  }
  // نسخة قديمة شغالة: نقفلها ونشغّل الجديدة
  if (p.online) await stopRunning();

  if (rebuild) {
    try {
      await publish();
    } catch (error) {
      log("build failed:", error?.message ?? error);
      // لو فيه نسخة مبنية قبل كده نشغّلها (مثلاً السيرفر عليه Runtime بس من غير SDK)
      if (!fs.existsSync(DLL)) {
        state.lastError =
          error?.code === "ENOENT" ? "DotnetMissing" : "PublishFailed";
        return { online: false };
      }
    }
  }
  if (!fs.existsSync(DLL)) {
    state.lastError = "NotInstalled";
    return { online: false };
  }

  log("starting...");
  spawnGateway();
  p = await waitOnline(90_000);
  if (p.online && p.authorized) {
    state.lastError = null;
    state.restarts = 0;
    log("running on", gatewayUrl());
  } else if (!state.lastError) {
    state.lastError = "StartFailed";
  }
  return p;
}

// التأكد إن الخدمة شغالة (وتشغيلها لو لأ)
// wait=false: يبدأ في الخلفية ويرجع فوراً
export function ensureGateway({ wait = true } = {}) {
  if (!autoStartEnabled()) return wait ? probeGateway() : null;
  if (!state.starting) {
    state.starting = start()
      .catch((error) => {
        state.lastError = "StartFailed";
        log("error:", error?.message ?? error);
        return { online: false };
      })
      .finally(() => {
        state.starting = null;
      });
  }
  return wait ? state.starting : null;
}
