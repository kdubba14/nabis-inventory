import axios from "axios";
import { RecordWithWMS, RestOptional, SkuBatchData } from "src/interfaces.util";

const logger = console;

export const client = axios.create({
  baseURL: "https://local-inventory.nabis.dev/v1",
  timeout: 1000,
});

type InventoryItem = RestOptional<
  RecordWithWMS,
  "skuId" | "skuBatchId" | "warehouseId"
>;
type InventoryAggregateItem = RestOptional<
  SkuBatchData,
  "skuId" | "skuBatchId"
>;

export interface ReturnResponse {
  success: boolean;
  error?: string;
}

export const insertInventoryItemsViaApi = async (
  data: InventoryItem[]
): Promise<ReturnResponse> => {
  try {
    await Promise.all(data.map((item) => client.post("/inventory", item)));
  } catch (err) {
    logger.warn(`An error occurred - ${String(err)}`);
    return { error: String(err), success: false };
  }
  return { success: true };
};

export const insertInventoryAggregateItemsViaApi = async (
  data: InventoryAggregateItem[]
): Promise<ReturnResponse> => {
  try {
    await Promise.all(
      data.map((item) => client.post("/inventory-aggregate", item))
    );
  } catch (err) {
    logger.warn(`An error occurred - ${String(err)}`);
    return { error: String(err), success: false };
  }
  return { success: true };
};

export const updateInventoryItemsViaApi = async (
  data: InventoryItem[]
): Promise<ReturnResponse> => {
  try {
    await Promise.all(data.map((item) => client.put("/inventory", item)));
  } catch (err) {
    logger.warn(`An error occurred - ${String(err)}`);
    return { error: String(err), success: false };
  }
  return { success: true };
};

export const updateInventoryAggregateItemsViaApi = async (
  data: InventoryItem[]
): Promise<ReturnResponse> => {
  try {
    await Promise.all(
      data.map((item) => client.put("/inventory-aggregate", item))
    );
  } catch (err) {
    logger.warn(`An error occurred - ${String(err)}`);
    return { error: String(err), success: false };
  }
  return { success: true };
};

export const isInventoryItemArray = (arr: any[]): arr is InventoryItem[] => {
  return arr.every(
    (i) => "skuId" in i && "skuBatchId" in i && "warehouseId" in i
  );
};

export const isInventoryAggregateItemArray = (
  arr: any[]
): arr is InventoryItem[] => {
  return arr.every((i) => "skuId" in i && "skuBatchId" in i);
};
