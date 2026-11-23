"use server";

// وسيط الطباعة: كود الربط والأجهزة (الإعدادات) + مهام الطباعة (الكاشير)
import { z } from "zod";
import { runAction } from "@/lib/action";
import { idField } from "@/validations/common.schema";
import {
  branchPairCode,
  createPrintJobs,
  deleteAgent,
  jobsStatus,
  listAgents,
  openCashDrawer,
  retryJob,
  runAgentCommand,
  setAgentActive,
} from "@/services/print-agent.service";

// إعدادات الطباعة (كل الأنشطة) أو إعدادات المطعم
const manage = { permission: ["printing.update", "restaurant.manage"] };
const pos = { permission: "sales.pos" };

// ---------- الإعدادات ----------
export const pairCodeAction = async (input) =>
  runAction(
    z.object({ branchId: idField, regenerate: z.boolean().default(false) }),
    input,
    (d) => branchPairCode(d.branchId, { regenerate: d.regenerate }),
    manage,
  );

export const printAgentsAction = async () =>
  runAction(null, null, () => listAgents(), manage);

export const setAgentActiveAction = async (input) =>
  runAction(
    z.object({ id: idField, isActive: z.boolean() }),
    input,
    (d) => setAgentActive(d.id, d.isActive),
    { ...manage, refresh: true },
  );

export const deleteAgentAction = async (id) =>
  runAction(idField, id, (d) => deleteAgent(d), { ...manage, refresh: true });

// اختبار الاتصال / طباعة تجربة / بحث عن الطابعات (بيستنى النتيجة من الوسيط)
export const agentCommandAction = async (input) =>
  runAction(
    z.object({
      branchId: idField,
      kind: z.enum(["probe", "test", "scan"]),
      connection: z.enum(["network", "windows"]).nullish(),
      host: z
        .string()
        .trim()
        .max(100)
        .regex(/^[A-Za-z0-9.-]*$/, "RestaurantPrinterHostInvalid")
        .nullish(),
      port: z.number().int().min(1).max(65535).nullish(),
      windowsName: z.string().trim().max(150).nullish(),
      paperSize: z.enum(["80mm", "58mm"]).nullish(),
    }),
    input,
    (d) => runAgentCommand(d),
    manage,
  );

// ---------- الكاشير ----------
// الصور (base64 PNG) مرسومة في المتصفح بنفس شكل الطباعة
export const createPrintJobsAction = async (input) =>
  runAction(
    z
      .array(
        z.object({
          printerId: idField,
          image: z.string().min(100).max(2_500_000),
          title: z.string().trim().max(150).nullish(),
          // فتح الدرج بعد الطباعة (حسب إعداد الجهاز)
          openDrawer: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(20),
    input,
    (d, user) => createPrintJobs(d, user),
    pos,
  );

export const printJobsStatusAction = async (ids) =>
  runAction(z.array(idField).max(50), ids, (d, user) => jobsStatus(d, user), pos);

// فتح الدرج يدوي من الكاشير (من غير بيع) - بيتسجل
export const openDrawerAction = async (input) =>
  runAction(
    z.object({ printerId: idField.nullish(), reason: z.string().trim().max(200).nullish() }),
    input,
    (d, user) => openCashDrawer(d, user),
    { permission: "sales.openDrawer" },
  );

export const retryPrintJobAction = async (id) =>
  runAction(idField, id, (d, user) => retryJob(d, user), pos);
