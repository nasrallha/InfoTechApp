"use server";

// البوابة بين شاشات قوائم الأسعار والسيرفر

import { runAction } from "@/lib/action";
import {
  createPriceListSchema,
  updatePriceListSchema,
  deletePriceListsSchema,
  priceListProductsSchema,
  savePricesSchema,
} from "@/validations/price-list.schema";
import {
  createPriceList,
  updatePriceList,
  deletePriceLists,
  getPriceListProducts,
  savePriceListPrices,
} from "@/services/price-list.service";

export async function createPriceListAction(input) {
  return runAction(createPriceListSchema, input, (d) => createPriceList(d), {
    permission: "priceLists.create",
    refresh: true,
  });
}

export async function updatePriceListAction(input) {
  return runAction(updatePriceListSchema, input, (d) => updatePriceList(d), {
    permission: "priceLists.update",
    refresh: true,
  });
}

export async function deletePriceListsAction(ids) {
  return runAction(deletePriceListsSchema, ids, (d) => deletePriceLists(d), {
    permission: "priceLists.delete",
    refresh: true,
  });
}

export async function getPriceListProductsAction(input) {
  return runAction(
    priceListProductsSchema,
    input,
    (d) => getPriceListProducts(d),
    { permission: "priceLists.view" },
  );
}

export async function savePriceListPricesAction(input) {
  return runAction(savePricesSchema, input, (d) => savePriceListPrices(d), {
    permission: "priceLists.update",
  });
}
