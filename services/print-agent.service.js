import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { currentCompanyCode, multiTenant } from "@/lib/tenant";

// ============================================================
// وسيط الطباعة (برنامج Node صغير على جهاز ويندوز في المطعم)
// - الربط: كود الفرع (ثابت، يتغيّر من الإعدادات) ← الوسيط بياخد مفتاح سري (token)
//   كود الربط اللي بيتكتب في الوسيط = <كود الشركة>-<كود الفرع> (مثال main-AB12CD34)
// - الوسيط بيسأل عن المهام (long-poll) وبيبعت النتيجة، وبيبعت طابعات ويندوز اللي عليه
// - المهمة: print صورة جاهزة (المتصفح بيرسمها بنفس شكل الشاشة) | test | probe | scan
// - الوسيط "متصل" = ظهر آخر 45 ثانية
// ============================================================

const ONLINE_MS = 45_000;
// مهمة اتسحبت ومجتش نتيجتها خلال دقيقة ← ترجع للطابور (لحد 3 مرات)
const STALE_MS = 60_000;
const MAX_ATTEMPTS = 3;

const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const KEY_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomKey = (len = 8) =>
  Array.from(crypto.randomBytes(len), (b) => KEY_CHARS[b % KEY_CHARS.length]).join("");

const companyCode = async () => (multiTenant() ? await currentCompanyCode() : "main");

// ------------------------------------------------------------
// كود الربط للفرع (بيتعمل أول مرة)
// ------------------------------------------------------------
export async function branchPairCode(branchId, { regenerate = false } = {}) {
  const b = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, printAgentKey: true },
  });
  if (!b) throw new AppError("BranchNotFound");
  let key = b.printAgentKey;
  if (!key || regenerate) {
    for (let i = 0; i < 5; i++) {
      key = randomKey();
      try {
        await prisma.branch.update({
          where: { id: branchId },
          data: { printAgentKey: key },
        });
        break;
      } catch (e) {
        if (e?.code !== "P2002") throw e;
      }
    }
  }
  return `${await companyCode()}-${key}`;
}

// ------------------------------------------------------------
// شاشة الإعدادات: الأجهزة المربوطة
// ------------------------------------------------------------
export async function listAgents() {
  const rows = await prisma.printAgent.findMany({
    orderBy: [{ branchId: "asc" }, { id: "asc" }],
    select: {
      id: true,
      branchId: true,
      name: true,
      hostName: true,
      agentVersion: true,
      winPrinters: true,
      lastSeenAt: true,
      isActive: true,
      createdAt: true,
    },
  });
  const now = Date.now();
  return rows.map((a) => ({
    ...a,
    winPrinters: Array.isArray(a.winPrinters) ? a.winPrinters : [],
    online:
      a.isActive && a.lastSeenAt && now - a.lastSeenAt.getTime() < ONLINE_MS,
  }));
}

export async function setAgentActive(id, isActive) {
  await prisma.printAgent
    .update({ where: { id }, data: { isActive } })
    .catch((e) => {
      if (e?.code === "P2025") throw new AppError("PrintAgentNotFound");
      throw e;
    });
  return { id };
}

export async function deleteAgent(id) {
  await prisma.printAgent.delete({ where: { id } }).catch((e) => {
    if (e?.code === "P2025") throw new AppError("PrintAgentNotFound");
    throw e;
  });
  return { id };
}

async function branchOnline(branchId) {
  const a = await prisma.printAgent.findFirst({
    where: {
      branchId,
      isActive: true,
      lastSeenAt: { gte: new Date(Date.now() - ONLINE_MS) },
    },
    select: { id: true },
  });
  return Boolean(a);
}

// ============================================================
// واجهة الوسيط (API)
// ============================================================

// الربط: كود الفرع ← مفتاح سري للجهاز
export async function pairAgent({ key, name, hostName, version }) {
  const branch = await prisma.branch.findFirst({
    where: { printAgentKey: String(key ?? "").toUpperCase() },
    select: { id: true, arName: true, enName: true },
  });
  if (!branch) throw new AppError("PrintAgentKeyInvalid");
  const token = crypto.randomBytes(32).toString("hex");
  const agent = await prisma.printAgent.create({
    data: {
      branchId: branch.id,
      name: String(name || hostName || "Windows").slice(0, 100),
      hostName: hostName ? String(hostName).slice(0, 100) : null,
      agentVersion: version ? String(version).slice(0, 20) : null,
      tokenHash: sha(token),
      lastSeenAt: new Date(),
    },
    select: { id: true, name: true },
  });
  return { token, agent, branch };
}

// المفتاح السري ← الجهاز (ويتسجل إنه ظهر دلوقتي)
export async function authAgent(token) {
  if (!token) throw new AppError("Unauthorized");
  const agent = await prisma.printAgent.findUnique({
    where: { tokenHash: sha(token) },
    select: { id: true, branchId: true, isActive: true },
  });
  if (!agent || !agent.isActive) throw new AppError("Unauthorized");
  await prisma.printAgent.update({
    where: { id: agent.id },
    data: { lastSeenAt: new Date() },
  });
  return agent;
}

// طابعات ويندوز + نسخة الوسيط
export async function agentHeartbeat(agent, { printers, version, hostName }) {
  await prisma.printAgent.update({
    where: { id: agent.id },
    data: {
      lastSeenAt: new Date(),
      ...(Array.isArray(printers)
        ? { winPrinters: printers.map((p) => String(p).slice(0, 150)).slice(0, 50) }
        : {}),
      ...(version ? { agentVersion: String(version).slice(0, 20) } : {}),
      ...(hostName ? { hostName: String(hostName).slice(0, 100) } : {}),
    },
  });
  return { ok: true };
}

const jobSelect = {
  id: true,
  jobKind: true,
  title: true,
  connection: true,
  targetHost: true,
  targetPort: true,
  windowsName: true,
  paperSize: true,
  copies: true,
  autoCut: true,
  beep: true,
  priority: true,
  imageData: true,
};

// المهام الجاية (long-poll): بيستنى لحد waitMs لو مفيش، والأولوية الأصغر الأول
export async function takeJobs(agent, waitMs = 25_000) {
  const until = Date.now() + Math.min(waitMs, 30_000);
  for (;;) {
    // مهام اتسحبت ومجتش نتيجتها ← ترجع للطابور
    await prisma.printJob.updateMany({
      where: {
        branchId: agent.branchId,
        jobStatus: "taken",
        takenAt: { lt: new Date(Date.now() - STALE_MS) },
        attempts: { lt: MAX_ATTEMPTS },
      },
      data: { jobStatus: "queued" },
    });
    const ready = await prisma.printJob.findMany({
      where: { branchId: agent.branchId, jobStatus: "queued" },
      orderBy: [{ priority: "asc" }, { id: "asc" }],
      take: 10,
      select: { id: true },
    });
    if (ready.length) {
      const ids = ready.map((j) => j.id);
      // سحب ذرّي: لو وسيطين في نفس الفرع، المهمة لواحد بس
      const taken = [];
      for (const id of ids) {
        const { count } = await prisma.printJob.updateMany({
          where: { id, jobStatus: "queued" },
          data: {
            jobStatus: "taken",
            agentId: agent.id,
            takenAt: new Date(),
            attempts: { increment: 1 },
          },
        });
        if (count) taken.push(id);
      }
      if (taken.length) {
        const jobs = await prisma.printJob.findMany({
          where: { id: { in: taken } },
          orderBy: [{ priority: "asc" }, { id: "asc" }],
          select: jobSelect,
        });
        return jobs;
      }
    }
    if (Date.now() >= until) return [];
    await new Promise((r) => setTimeout(r, 400));
  }
}

// نتيجة المهمة من الوسيط
export async function jobResult(agent, id, { ok, error, result }) {
  const { count } = await prisma.printJob.updateMany({
    where: { id, branchId: agent.branchId },
    data: {
      jobStatus: ok ? "done" : "failed",
      errorText: ok ? null : String(error ?? "Unknown").slice(0, 500),
      resultData: result ?? undefined,
      doneAt: new Date(),
      // الصورة مش محتاجينها بعد الطباعة (مساحة)
      ...(ok ? { imageData: null } : {}),
    },
  });
  if (!count) throw new AppError("PrintJobNotFound");
  return { ok: true };
}

// ============================================================
// من البرنامج (الكاشير / الإعدادات)
// ============================================================

// مهام طباعة صور (تذكرة / فاتورة) على طابعات الفرع
// jobs: [{ printerId, image (base64 PNG), title }]
// الوسيط مش متصل ← { online: false } والشاشة بتطبع من المتصفح
export async function createPrintJobs(jobs, user) {
  const branchId = user.branch.id;
  if (!(await branchOnline(branchId))) return { online: false, ids: [] };
  const printerIds = [...new Set(jobs.map((j) => j.printerId))];
  const printers = await prisma.restaurantPrinter.findMany({
    where: { id: { in: printerIds }, branchId, isActive: true },
    select: {
      id: true,
      name: true,
      connection: true,
      host: true,
      port: true,
      windowsName: true,
      paperSize: true,
      copies: true,
      autoCut: true,
      beep: true,
      priority: true,
    },
  });
  const byId = new Map(printers.map((p) => [p.id, p]));
  const ids = [];
  for (const j of jobs) {
    const p = byId.get(j.printerId);
    if (!p || p.connection === "browser") continue;
    const job = await prisma.printJob.create({
      data: {
        branchId,
        printerId: p.id,
        jobKind: "print",
        title: j.title ? String(j.title).slice(0, 150) : p.name,
        connection: p.connection,
        targetHost: p.host,
        targetPort: p.port,
        windowsName: p.windowsName,
        paperSize: p.paperSize,
        copies: p.copies,
        autoCut: p.autoCut,
        beep: p.beep,
        priority: p.priority,
        imageData: j.image,
      },
      select: { id: true },
    });
    ids.push(job.id);
  }
  return { online: true, ids };
}

// حالة المهام (الكاشير بيتابع اللي فشل)
export async function jobsStatus(ids, user) {
  const rows = await prisma.printJob.findMany({
    where: { id: { in: ids }, branchId: user.branch.id },
    select: {
      id: true,
      jobStatus: true,
      errorText: true,
      title: true,
      printer: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    status: r.jobStatus,
    error: r.errorText,
    printer: r.printer?.name ?? r.title,
  }));
}

// إعادة مهمة فشلت
export async function retryJob(id, user) {
  const { count } = await prisma.printJob.updateMany({
    where: { id, branchId: user.branch.id, jobStatus: "failed" },
    data: { jobStatus: "queued", attempts: 0, errorText: null, doneAt: null },
  });
  if (!count) throw new AppError("PrintJobNotFound");
  return { id };
}

// أوامر الإعدادات (اختبار الاتصال / طباعة تجربة / بحث) ← بيستنى النتيجة
// kind: probe | test | scan
export async function runAgentCommand({ branchId, kind, host, port, windowsName, connection, paperSize }) {
  if (!(await branchOnline(branchId))) throw new AppError("PrintAgentOffline");
  const job = await prisma.printJob.create({
    data: {
      branchId,
      jobKind: kind,
      title: kind,
      connection: connection ?? (host ? "network" : windowsName ? "windows" : null),
      targetHost: host ?? null,
      targetPort: port ?? 9100,
      windowsName: windowsName ?? null,
      paperSize: paperSize ?? "80mm",
      priority: -1,
    },
    select: { id: true },
  });
  const until = Date.now() + (kind === "scan" ? 45_000 : 20_000);
  for (;;) {
    const j = await prisma.printJob.findUnique({
      where: { id: job.id },
      select: { jobStatus: true, errorText: true, resultData: true },
    });
    if (j.jobStatus === "done" || j.jobStatus === "failed")
      return { ok: j.jobStatus === "done", error: j.errorText, result: j.resultData };
    if (Date.now() >= until) {
      await prisma.printJob.update({
        where: { id: job.id },
        data: { jobStatus: "failed", errorText: "Timeout" },
      });
      return { ok: false, error: "Timeout" };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}
