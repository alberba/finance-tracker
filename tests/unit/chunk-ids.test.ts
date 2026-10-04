import { describe, expect, it } from "vitest";
import {
  MAX_SQL_VARIABLES_PER_STATEMENT,
  chunkIds,
} from "../../src/db/repositories/shared";

/**
 * FINANCE-TRACKER-7: `GET /api/bootstrap` 500s with `D1_ERROR: too many SQL
 * variables` because the batch loaders passed every id to a single
 * `inArray(...)`. `chunkIds` is the single splitting rule every unbounded
 * `inArray` in the repository layer now goes through.
 */
describe("chunkIds", () => {
  it("returns no chunks for an empty id list", () => {
    expect(chunkIds([])).toEqual([]);
  });

  it("returns a single chunk when the ids fit exactly in one statement", () => {
    const ids = Array.from({ length: MAX_SQL_VARIABLES_PER_STATEMENT }, (_, index) => `id-${index}`);

    const chunks = chunkIds(ids);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(50);
    expect(chunks[0]).toEqual(ids);
  });

  it("splits one id over the ceiling into a full chunk plus a remainder", () => {
    const ids = Array.from({ length: 51 }, (_, index) => `id-${index}`);

    const chunks = chunkIds(ids);

    expect(chunks.map((chunk) => chunk.length)).toEqual([50, 1]);
    expect(chunks[1]).toEqual(["id-50"]);
  });

  it("splits 130 ids into 50/50/30 preserving order", () => {
    const ids = Array.from({ length: 130 }, (_, index) => `id-${index}`);

    const chunks = chunkIds(ids);

    expect(chunks.map((chunk) => chunk.length)).toEqual([50, 50, 30]);
    expect(chunks.flat()).toEqual(ids);
  });

  it("preserves the original order across chunks", () => {
    const ids = ["c", "a", "b", "e", "d"];

    expect(chunkIds(ids, 2).flat()).toEqual(ids);
  });

  it("honors a custom chunk size", () => {
    const ids = ["a", "b", "c", "d", "e"];

    expect(chunkIds(ids, 3).map((chunk) => chunk.length)).toEqual([3, 2]);
    expect(chunkIds(ids, 1).map((chunk) => chunk.length)).toEqual([1, 1, 1, 1, 1]);
  });

  it("never emits an empty chunk for non-empty input", () => {
    for (const size of [1, 2, 7, 50]) {
      const chunks = chunkIds(["a", "b", "c", "d", "e"], size);

      expect(chunks.every((chunk) => chunk.length > 0)).toBe(true);
      expect(chunks.flat()).toEqual(["a", "b", "c", "d", "e"]);
    }
  });
});
