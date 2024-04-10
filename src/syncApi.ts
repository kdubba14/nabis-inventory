import {
  WMSWarehouseMeta,
  inventoryUpdate,
  RecordWithWMS,
  SkuBatchData,
  SkuBatchToSkuId,
  skuBatchUpdate,
} from "./interfaces.util";
import {
  appData,
  appSkuBatchData,
  appSkuBatchDataForSkuBatchIds,
  skuBatchIdsFromInventoryDb,
  skuBatchIdsFromAppDb,
  warehouseData,
} from "./db/data";
import {
  ReturnResponse,
  insertInventoryAggregateItemsViaApi,
  insertInventoryItemsViaApi,
  isInventoryAggregateItemArray,
  isInventoryItemArray,
  updateInventoryAggregateItemsViaApi,
  updateInventoryItemsViaApi,
} from "./api/inventory";

const logger = console;

/**
 * Create a list of records for a skuBatch record that maps skuBatchId + warehouseId
 * @param skuBatchRecord
 */
const makeWarehouseRecordsForSkuBatchRecord = (
  skuBatchRecord: SkuBatchToSkuId
): RecordWithWMS[] => {
  return warehouseData.map(
    (warehouse: WMSWarehouseMeta): RecordWithWMS => ({
      skuBatchId: skuBatchRecord.skuBatchId,
      skuId: skuBatchRecord.skuId,
      wmsId: skuBatchRecord.wmsId,
      quantityPerUnitOfMeasure: skuBatchRecord.quantityPerUnitOfMeasure ?? 1,
      isArchived: skuBatchRecord.isArchived,
      isDeleted: skuBatchRecord.isDeleted,
      warehouseId: warehouse.warehouseId,
    })
  );
};

/**
 * Converts a list of skuBatchIds from the app db into an insert to inventory.
 * @param skuBatchIdsToInsert
 */
export async function skuBatchToInserts(
  skuBatchIdsToInsert: string[]
): Promise<ReturnResponse> {
  const badSkuBatchCounter = { count: 0 };

  // create our inserts
  const inserts = skuBatchIdsToInsert.reduce(
    (arr: RecordWithWMS[], skuBatchId: string): RecordWithWMS[] => {
      const skuBatchRecordFromAppDb: SkuBatchToSkuId | undefined = appData.find(
        (skuBatchToSkuId: SkuBatchToSkuId): boolean =>
          skuBatchToSkuId.skuBatchId === skuBatchId
      );

      if (!skuBatchRecordFromAppDb) {
        logger.error(
          `no records found in app SkuBatch [skuBatchId=${skuBatchId}}]`
        );
        badSkuBatchCounter.count += 1;
        return arr;
      }

      arr.push(
        ...makeWarehouseRecordsForSkuBatchRecord(skuBatchRecordFromAppDb)
      );
      return arr;
    },
    []
  );

  const res = await insertInventoryItemsViaApi(inserts);
  const res2 = await insertInventoryAggregateItemsViaApi(
    inserts.map((i) => ({ ...i, wmsId: String(i.wmsId) }))
  );

  logger.log(
    `created inserts [count=${inserts.length}, badSkuBatchRecordCount=${badSkuBatchCounter.count}]`
  );

  return {
    error:
      (res.error ?? "") + (res.error && res2.error ? " + " + res2.error : ""),
    success: res.success && res2.success,
  };
}

/**
 * Diffs the inventory between app SkuBatch and inventory to determine
 * what we need to copy over.
 */
export async function getDeltas(): Promise<string[]> {
  try {
    const inventorySkuBatchIds: Set<string> = new Set<string>(
      skuBatchIdsFromInventoryDb.map(
        (r: { skuBatchId: string }) => r.skuBatchId
      )
    );

    return [
      ...new Set<string>(skuBatchIdsFromAppDb.map((r: { id: string }) => r.id)),
    ].filter((x: string) => !inventorySkuBatchIds.has(x));
  } catch (err) {
    logger.error("error querying databases for skuBatchIds");
    logger.error(err);
    throw err;
  }
}

/**
 * Finds the deltas between two lists of SkuBatchData
 * @param appSkuBatchData
 * @param inventorySkuBatchData
 */
export const findDeltas = (
  appSkuBatchData: SkuBatchData[],
  inventorySkuBatchData: SkuBatchData[]
): SkuBatchData[] => {
  logger.log(
    "finding data changes between inventory and app SkuBatch datasets"
  );

  return appSkuBatchData
    .map((appSbd: SkuBatchData) => {
      const inventoryRecord: SkuBatchData | undefined =
        inventorySkuBatchData.find(
          (r: SkuBatchData): boolean => r.skuBatchId == appSbd.skuBatchId
        );

      if (!inventoryRecord) {
        // if we cannot find the matching record, we have a problem
        logger.warn(
          `cannot find matching inventory record! [skuBatchId=${appSbd.skuBatchId}]`
        );
        // instead of throwing an error, return empty update array which will
        // get filtered out at the end of this chain
        return { skuBatchId: "", updates: [] };
      }

      // go through each key and see if it is different, if so, track it
      const updates: inventoryUpdate[] = Object.keys(inventoryRecord)
        .filter((k: string) => !["skuBatchId"].includes(k))
        .reduce(
          (
            recordUpdates: inventoryUpdate[],
            key: string
          ): inventoryUpdate[] => {
            const inventoryValue =
              inventoryRecord[key as keyof typeof inventoryRecord];
            const appValue = appSbd[key as keyof typeof appSbd];

            if (key == "skuId" && inventoryValue != null) {
              // if the key is skuId and the current value is set, we won't update
              return recordUpdates;
            }

            if (inventoryValue != appValue) {
              recordUpdates.push({ field: key, newValue: appValue });
            }

            return recordUpdates;
          },
          [] as inventoryUpdate[]
        );

      return {
        skuBatchId: inventoryRecord.skuBatchId,
        updates,
        skuBatchItem: updates.length ? appSbd : undefined,
      };
    })
    .filter((sbu: skuBatchUpdate) => {
      return !!sbu.skuBatchItem;
    })
    .map((sbu) => sbu.skuBatchItem as SkuBatchData);
};

/**
 *  Finds & Updates changes in data between the app SkuBatch+Sku and inventory tables
 */
export async function updateFromChangesBetweenDatasets(): Promise<
  SkuBatchData[]
> {
  logger.log(
    "finding app SkuBatch data that has changed and <> the inventory data"
  );

  const updates = await [appSkuBatchData].reduce(
    async (
      accumPromise: Promise<SkuBatchData[]>,
      inventorySkuBatchData: SkuBatchData[]
    ) => {
      const accum = await accumPromise;
      const skuBatchIds: string[] = inventorySkuBatchData.map(
        (sbd: SkuBatchData) => sbd.skuBatchId
      );

      logger.log(
        `querying Logistics.SkuBatch for data [skuBatchIdCount=${skuBatchIds.length}]`
      );
      // fetch SkuBatch+Sku data from the app database
      const appSkuBatchData: SkuBatchData[] = appSkuBatchDataForSkuBatchIds;

      // if we have a count mismatch, something is wrong, and we should log out a warning
      if (appSkuBatchData.length != inventorySkuBatchData.length) {
        const appSkuBatchDataSkuBatchIds = appSkuBatchData.map(
          (asbd) => asbd.skuBatchId
        );
        const missingIds = inventorySkuBatchData.filter(
          (isbd) => appSkuBatchDataSkuBatchIds.indexOf(isbd.skuBatchId) === -1
        );

        logger.warn(
          `app data is missing ids from inventory data [skuBatchIds=(${missingIds.join(
            ", "
          )})]`
        );
      }

      // push our new sql updates into the accumulator list
      const ds = findDeltas(appSkuBatchData, inventorySkuBatchData);

      accum.push(...ds);
      return accum;
    },
    Promise.resolve([])
  );

  logger.log(`built updates [count=${updates.length}]`);

  return updates;
}

/**
 * Updates inventory data from app SkuBatch and Sku
 */
export async function copyMissingInventoryRecordsFromSkuBatch(): Promise<void | Error> {
  logger.log("copying missing inventory records from app Sku/SkuBatch");

  // find out what skuBatchIds don't exist in inventory
  const skuBatchIdsToInsert: string[] = await getDeltas();
  logger.log(
    `copying new skuBatch records... [skuBatchCount=${skuBatchIdsToInsert.length}]`
  );
  try {
    const res = await skuBatchToInserts(skuBatchIdsToInsert);
    if (res.error || !res.success) throw res.error;
  } catch (err) {
    logger.error(err);
    throw err;
  }

  logger.log("done updating additive data to inventory from app db");
}

/**
 * Pulls inventory and SkuBatch data and finds changes in SkuBatch data
 * that are not in the inventory data.
 */
export async function updateInventoryDeltasFromSkuBatch(): Promise<void> {
  logger.log('updating inventory from deltas in "SkuBatch" data');

  try {
    const updates = await updateFromChangesBetweenDatasets();
    if (isInventoryItemArray(updates)) {
      await updateInventoryItemsViaApi(updates);
    }
    if (isInventoryAggregateItemArray(updates)) {
      await updateInventoryAggregateItemsViaApi(updates);
    }
  } catch (err) {
    logger.error(err);
    throw err;
  }

  logger.log("done updating inventory from deltas from app db");
}

/**
 * Primary entry point to sync SkuBatch data from the app
 * database over to the inventory database
 */
export async function sync(): Promise<void | Error> {
  try {
    await copyMissingInventoryRecordsFromSkuBatch();
    await updateInventoryDeltasFromSkuBatch();
  } catch (err) {
    logger.error("error syncing skuBatch data");
    return Promise.reject(err);
  }
}

// NOTE: the APIs always return 404 unless I mock them
