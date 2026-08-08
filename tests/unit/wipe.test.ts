import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";

import { getOrCreateEncryptionKey } from "../../src/lib/client/crypto";
import { getAllEntities, openIdbCache, putEntity } from "../../src/lib/client/idb-cache";
import { count, enqueue, openOutbox } from "../../src/lib/client/outbox";
import { wipeAllClientData } from "../../src/lib/client/wipe";

const USER_ID = "user-wipe-test";

describe("wipeAllClientData", () => {
  it("deletes the cache, outbox and key databases together", async () => {
    const cacheDb = await openIdbCache(USER_ID);
    await putEntity(cacheDb, "account", { id: "acc-1" });
    cacheDb.close();

    const outboxDb = await openOutbox(USER_ID);
    await enqueue(outboxDb, { action: "noop" });
    outboxDb.close();

    await getOrCreateEncryptionKey(USER_ID);

    await wipeAllClientData(USER_ID);

    const reopenedCache = await openIdbCache(USER_ID);
    expect(await getAllEntities(reopenedCache, "account")).toEqual([]);
    reopenedCache.close();

    const reopenedOutbox = await openOutbox(USER_ID);
    expect(await count(reopenedOutbox)).toBe(0);
    reopenedOutbox.close();
  });
});
