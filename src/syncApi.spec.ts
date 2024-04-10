import MockAdapter from "axios-mock-adapter";

import {
  updateFromChangesBetweenDatasets,
  findDeltas,
  getDeltas,
  skuBatchToInserts,
} from "./syncApi";
import { SkuBatchData } from "./interfaces.util";
import { client } from "./api/inventory";

describe("sync", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe(".skuBatchToInserts", () => {
    it("should return a list of inserts", async () => {
      const mock = new MockAdapter(client);
      const data = [
        {
          skuBatchId: "sku-batch-id-1",
          skuId: "sku-id-1",
          quantityPerUnitOfMeasure: 25,
        },
        {
          skuBatchId: "sku-batch-id-2",
          skuId: "sku-id-1",
          quantityPerUnitOfMeasure: 25,
        },
        {
          skuBatchId: "sku-batch-id-3",
          skuId: "sku-id-2",
          quantityPerUnitOfMeasure: 1,
        },
      ];

      mock
        .onPost("https://local-inventory.nabis.dev/v1/inventory")
        .reply(200, {});

      mock
        .onPost("https://local-inventory.nabis.dev/v1/inventory-aggregate")
        .reply(200, {});

      await expect(
        skuBatchToInserts(data.map((d) => d.skuBatchId))
      ).resolves.toStrictEqual({ error: "", success: true });
    });
  });

  describe(".getDeltas", () => {
    it("should find deltas", async () => {
      // example of the data below:
      // skuBatchIds = ['sku-batch-id-1', 'sku-batch-id-2', 'sku-batch-id-3', 'sku-batch-id-4'];
      // appSkuBatchIds = [...skuBatchIds, 'sku-batch-id-5', 'sku-batch-id-6']; // 5 and 6 are new
      await expect(getDeltas()).resolves.toStrictEqual([
        "sku-batch-id-5",
        "sku-batch-id-6",
      ]);
    });
  });

  describe(".findDelta", () => {
    it("should pick up changes to quantityPerUnitOfMeasure", async () => {
      const appData = [
        {
          skuBatchId: "1",
          skuId: "1",
          wmsId: "1",
          quantityPerUnitOfMeasure: 5,
          isArchived: false,
          isDeleted: false,
        },
      ];

      const inventoryData = [
        {
          skuBatchId: "1",
          skuId: "1",
          wmsId: "1",
          quantityPerUnitOfMeasure: 10,
          isArchived: false,
          isDeleted: false,
        },
      ];

      const deltas: SkuBatchData[] = findDeltas(appData, inventoryData);
      expect(deltas.length).toBe(1);
      expect(deltas[0].quantityPerUnitOfMeasure).toBe(5);
    });

    it("should not change the skuId if already set", async () => {
      const appData = [
        {
          skuBatchId: "1",
          skuId: "12",
          wmsId: "1",
          quantityPerUnitOfMeasure: 10,
          isArchived: false,
          isDeleted: false,
        },
      ];

      const inventoryData = [
        {
          skuBatchId: "1",
          skuId: "1",
          wmsId: "1",
          quantityPerUnitOfMeasure: 10,
          isArchived: false,
          isDeleted: false,
        },
      ];

      const deltas: SkuBatchData[] = findDeltas(appData, inventoryData);
      expect(deltas.length).toBe(0);
    });

    it("should pick up change to skuId if not set", async () => {
      const appData = [
        {
          skuBatchId: "1",
          skuId: "12",
          wmsId: "1",
          quantityPerUnitOfMeasure: 10,
          isArchived: false,
          isDeleted: false,
        },
      ];

      const inventoryData = [
        {
          skuBatchId: "1",
          skuId: null,
          wmsId: "1",
          quantityPerUnitOfMeasure: 10,
          isArchived: false,
          isDeleted: false,
        },
      ];

      const deltas: SkuBatchData[] = findDeltas(appData, inventoryData);
      expect(deltas.length).toBe(1);
      expect(deltas[0].skuId).toBe("12");
    });

    it("should pick up change to wmsId", async () => {
      const appData = [
        {
          skuBatchId: "1",
          skuId: "1",
          wmsId: "7",
          quantityPerUnitOfMeasure: 10,
          isArchived: false,
          isDeleted: false,
        },
      ];

      const inventoryData = [
        {
          skuBatchId: "1",
          skuId: "1",
          wmsId: "1",
          quantityPerUnitOfMeasure: 10,
          isArchived: false,
          isDeleted: false,
        },
      ];

      const deltas: SkuBatchData[] = findDeltas(appData, inventoryData);
      expect(deltas.length).toBe(1);
      expect(deltas[0].wmsId).toBe("7");
    });

    it("should find changes between datasets", async () => {
      await expect(updateFromChangesBetweenDatasets()).resolves.toStrictEqual([
        expect.objectContaining({
          isArchived: false,
          isDeleted: true,
          quantityPerUnitOfMeasure: 1,
          skuBatchId: "sku-batch-id-5",
          skuId: "sku-id-2",
          wmsId: "1238",
        }),
        expect.objectContaining({
          isArchived: true,
          isDeleted: false,
          quantityPerUnitOfMeasure: 1,
          skuBatchId: "sku-batch-id-6",
          skuId: "sku-id-3",
          wmsId: "1239",
        }),
      ]);
    });
  });
});
