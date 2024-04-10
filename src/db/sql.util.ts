import { RecordWithWMS } from "../interfaces.util";

export const insertify = (record: RecordWithWMS): string =>
  `insert into test_table (col_1, col_2) values (${record.skuId}, ${record.skuBatchId})`;

export const getUpdateForSkuBatchRecord = (
  table: string,
  updates: string,
  skuBatchId: string
) => `update ${table} set ${updates} where sku_batch_id = '${skuBatchId}'`;

// no op that would take our db connection and execute the list of sql statements
export const queryExec = (db: any, sql: string[]): Promise<void> =>
  Promise.resolve();

export const formatSqlValue = (v: string | number | boolean | null) => {
  switch (typeof v) {
    case "string":
      return `'${v.replace(/'/g, "''")}`;
    case "number":
    case "boolean":
      return `${v}`;
    default:
      if (v === null) {
        return "NULL";
      }
      // NOTE: Should this support arrays or objects?
      throw new Error(`Type '${typeof v}' is unsupported.`);
  }
};
