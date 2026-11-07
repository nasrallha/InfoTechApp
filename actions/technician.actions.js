"use server";

// الفنيون والمواعيد والعمولات (وحدة technicians) + عقود الصيانة (وحدة maintenanceContracts)

import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { idField } from "@/validations/common.schema";
import {
  commissionSchema,
  contractListSchema,
  createContractSchema,
  createTechnicianSchema,
  jobsListSchema,
  updateContractSchema,
  updateSaleJobSchema,
  updateTechnicianSchema,
  updateVisitSchema,
} from "@/validations/technician.schema";
import {
  commissionReport,
  createTechnician,
  deleteTechnician,
  getTechnicians,
  listJobs,
  updateSaleJob,
  updateTechnician,
} from "@/services/technician.service";
import {
  cancelContract,
  createContract,
  getContract,
  listContracts,
  updateContract,
  updateVisit,
} from "@/services/maintenance-contract.service";

// ---------- الفنيون ----------
export const createTechnicianAction = async (input) =>
  runAction(createTechnicianSchema, input, (d) => createTechnician(d), {
    permission: "technicians.create",
    refresh: true,
  });
export const updateTechnicianAction = async (input) =>
  runAction(updateTechnicianSchema, input, (d) => updateTechnician(d), {
    permission: "technicians.update",
    refresh: true,
  });
export const deleteTechnicianAction = async (input) =>
  runAction(idField, input, (d) => deleteTechnician(d), {
    permission: "technicians.delete",
    refresh: true,
  });

// الفنيين النشطين (اختيار الفني في الفاتورة والعقود والمواعيد)
export const activeTechniciansAction = async () =>
  runAction(null, null, (_, user) => {
    if (
      !can(user, "sales.create") &&
      !can(user, "technicians.jobs") &&
      !can(user, "maintenanceContracts.create") &&
      !can(user, "maintenanceContracts.visits")
    )
      throw new AppError("Forbidden");
    return getTechnicians({ activeOnly: true });
  });

// ---------- المواعيد ----------
const canJobs = (user) =>
  can(user, "technicians.jobs") || can(user, "maintenanceContracts.visits");

export const listJobsAction = async (input) =>
  runAction(jobsListSchema, input, (d, user) => {
    if (!canJobs(user)) throw new AppError("Forbidden");
    return listJobs(d, user);
  });

export const updateSaleJobAction = async (input) =>
  runAction(updateSaleJobSchema, input, (d, u) => updateSaleJob(d, u), {
    permission: "technicians.jobs",
  });

// ---------- العمولات ----------
export const commissionReportAction = async (input) =>
  runAction(commissionSchema, input, (d, u) => commissionReport(d, u), {
    permission: "technicians.commissions",
  });

// ---------- عقود الصيانة ----------
export const listContractsAction = async (input) =>
  runAction(contractListSchema, input, (d, u) => listContracts(d, u), {
    permission: "maintenanceContracts.view",
  });
export const getContractAction = async (id) =>
  runAction(idField, id, (d, u) => getContract(d, u), {
    permission: "maintenanceContracts.view",
  });
export const createContractAction = async (input) =>
  runAction(createContractSchema, input, (d, u) => createContract(d, u), {
    permission: "maintenanceContracts.create",
  });
export const updateContractAction = async (input) =>
  runAction(updateContractSchema, input, (d, u) => updateContract(d, u), {
    permission: "maintenanceContracts.update",
    refresh: true,
  });
export const cancelContractAction = async (id) =>
  runAction(idField, id, (d, u) => cancelContract(d, u), {
    permission: "maintenanceContracts.cancel",
    refresh: true,
  });
export const updateVisitAction = async (input) =>
  runAction(updateVisitSchema, input, (d, u) => updateVisit(d, u), {
    permission: "maintenanceContracts.visits",
    refresh: true,
  });
