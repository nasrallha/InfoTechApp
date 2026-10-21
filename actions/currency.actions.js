"use server";

// البوابة بين شاشة العملات والسيرفر (صلاحية "currencies.update" لكل التعديلات)

import { runAction } from "@/lib/action";
import {
  createCurrencySchema,
  updateCurrencySchema,
  deleteCurrenciesSchema,
  setBaseCurrencySchema,
} from "@/validations/currency.schema";
import {
  createCurrency,
  updateCurrency,
  deleteCurrencies,
  setBaseCurrency,
} from "@/services/currency.service";

const options = { permission: "currencies.update", refresh: true };

export async function createCurrencyAction(input) {
  return runAction(createCurrencySchema, input, (d) => createCurrency(d), options);
}

export async function updateCurrencyAction(input) {
  return runAction(updateCurrencySchema, input, (d) => updateCurrency(d), options);
}

export async function setBaseCurrencyAction(id) {
  return runAction(setBaseCurrencySchema, id, (d) => setBaseCurrency(d), options);
}

export async function deleteCurrenciesAction(ids) {
  return runAction(deleteCurrenciesSchema, ids, (d) => deleteCurrencies(d), options);
}
