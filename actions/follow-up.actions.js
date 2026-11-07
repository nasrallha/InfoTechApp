"use server";

// المتابعة الدورية (وحدة followUps)
import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { idField } from "@/validations/common.schema";
import {
  followUpDoneSchema,
  followUpListSchema,
  followUpPostponeSchema,
  followUpReportSchema,
  followUpStatusSchema,
  followUpUpdateSchema,
} from "@/validations/follow-up.schema";
import {
  customerActiveFollowUps,
  followUpLogs,
  followUpReport,
  listFollowUps,
  markFollowUpDone,
  postponeFollowUp,
  setFollowUpStatus,
  updateFollowUp,
} from "@/services/follow-up.service";

export const listFollowUpsAction = async (input) =>
  runAction(followUpListSchema, input, (d, u) => listFollowUps(d, u), {
    permission: "followUps.view",
  });

export const followUpLogsAction = async (id) =>
  runAction(idField, id, (d, u) => followUpLogs(d, u), {
    permission: "followUps.view",
  });

export const markFollowUpDoneAction = async (input) =>
  runAction(followUpDoneSchema, input, (d, u) => markFollowUpDone(d, u), {
    permission: "followUps.update",
  });

export const postponeFollowUpAction = async (input) =>
  runAction(followUpPostponeSchema, input, (d, u) => postponeFollowUp(d, u), {
    permission: "followUps.update",
  });

export const setFollowUpStatusAction = async (input) =>
  runAction(followUpStatusSchema, input, (d, u) => setFollowUpStatus(d, u), {
    permission: "followUps.update",
  });

export const updateFollowUpAction = async (input) =>
  runAction(followUpUpdateSchema, input, (d, u) => updateFollowUp(d, u), {
    permission: "followUps.update",
  });

// متابعات العميل الشغالة (نافذة التجديد وقت حفظ الفاتورة)
export const customerActiveFollowUpsAction = async (customerId) =>
  runAction(idField, customerId, (id, user) => {
    if (!can(user, "sales.create")) throw new AppError("Forbidden");
    return customerActiveFollowUps(id);
  });

// تقرير المتابعات في فترة
export const followUpReportAction = async (input) =>
  runAction(followUpReportSchema, input, (d, u) => followUpReport(d, u), {
    permission: "followUps.view",
  });
