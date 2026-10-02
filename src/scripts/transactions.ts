import type { SortDirection, TxSortColumn } from "./types";

export interface TransactionSort {
  column: TxSortColumn;
  direction: SortDirection;
}
