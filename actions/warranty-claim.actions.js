"use server";

// طلبات الضمان والصيانة (وحدة warrantyClaims)

import { z } from "zod";
import { runAction } from "@/lib/action";
import { idField } from "@/validations/common.schema";
import {
  claimItemsSchema,
  claimListSchema,
  claimStatusSchema,
  createClaimSchema,
  updateClaimSchema,
} from "@/validations/warranty-claim.schema";
import {
  changeClaimStatus,
  createClaim,
  getClaim,
  listClaims,
  lookupDevice,
  setClaimItems,
  updateClaim,
} from "@/services/warranty-claim.service";
import { searchSaleProducts } from "@/services/sale-catalog.service";

export const lookupDeviceAction = async (q) =>
  runAction(z.string().trim().max(100), q, (d) => lookupDevice(d), {
    permission: "warrantyClaims.create",
  });

export const createClaimAction = async (input) =>
  runAction(createClaimSchema, input, (d, u) => createClaim(d, u), {
    permission: "warrantyClaims.create",
  });

export const updateClaimAction = async (input) =>
  runAction(updateClaimSchema, input, (d, u) => updateClaim(d, u), {
    permission: "warrantyClaims.update",
    refresh: true,
  });

export const changeClaimStatusAction = async (input) =>
  runAction(claimStatusSchema, input, (d, u) => changeClaimStatus(d, u), {
    permission: "warrantyClaims.update",
    refresh: true,
  });

export const setClaimItemsAction = async (input) =>
  runAction(claimItemsSchema, input, (d, u) => setClaimItems(d, u), {
    permission: "warrantyClaims.update",
    refresh: true,
  });

export const listClaimsAction = async (input) =>
  runAction(claimListSchema, input, (d, u) => listClaims(d, u), {
    permission: "warrantyClaims.view",
  });

export const getClaimAction = async (id) =>
  runAction(idField, id, (d, u) => getClaim(d, u), {
    permission: "warrantyClaims.view",
  });

// بحث الأصناف لقطع الغيار والمصنعية
export const searchClaimProductsAction = async (q) =>
  runAction(z.string().trim().max(100), q, (d, u) => searchSaleProducts(d, u), {
    permission: "warrantyClaims.update",
  });
