"use server";

// البحث بالرقم التسلسلي وتقرير الضمانات (وحدة serials)

import { z } from "zod";
import { runAction } from "@/lib/action";
import { isDay } from "@/lib/dates";
import { idField } from "@/validations/common.schema";
import {
  getSerialCard,
  searchSerials,
  warrantyReport,
} from "@/services/serial-query.service";

const searchSchema = z.string().trim().max(100);

export const searchSerialsAction = async (q) =>
  runAction(searchSchema, q, (d) => searchSerials(d), {
    permission: "serials.view",
  });

export const getSerialCardAction = async (id) =>
  runAction(idField, id, (d) => getSerialCard(d), {
    permission: "serials.view",
  });

const day = z.string().refine(isDay, "InvalidDate").optional();
const reportSchema = z.object({
  status: z.enum(["active", "expiring", "expired", "all"]).default("active"),
  q: z.string().trim().max(100).default(""),
  customerId: idField.optional(),
  from: day,
  to: day,
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(10).max(200).default(50),
  // التصدير: كل الصفوف
  all: z.boolean().default(false),
});

export const warrantyReportAction = async (filters) =>
  runAction(reportSchema, filters, (d) => warrantyReport(d), {
    permission: "serials.warranties",
  });
