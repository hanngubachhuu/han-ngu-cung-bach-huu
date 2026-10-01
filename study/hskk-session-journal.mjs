// Offline media retry queue. This is never an authorization source or an official result.
export class ExamSessionJournal {
  constructor(ownerId, attemptId) {
    this.scope = ownerId + ":" + attemptId;
  }
  async database() {
    if (!this.db)
      this.db = await new Promise((resolve, reject) => {
        const r = indexedDB.open("hnh-hskk-pending-media", 2);
        r.onupgradeneeded = () => {
          const store = r.result.objectStoreNames.contains("pending")
            ? r.transaction.objectStore("pending")
            : r.result.createObjectStore("pending", { keyPath: "key" });
          if (!store.indexNames.contains("scope"))
            store.createIndex("scope", "scope");
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(Error("LOCAL_SAVE_FAILED"));
      });
    return this.db;
  }
  async run(mode, fn) {
    const db = await this.database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("pending", mode),
        r = fn(tx.objectStore("pending"));
      tx.oncomplete = () => resolve(r.result);
      tx.onerror = () => reject(Error("LOCAL_SAVE_FAILED"));
      tx.onabort = () => reject(Error("LOCAL_SAVE_FAILED"));
    });
  }
  async put(questionId, entry) {
    await this.run("readwrite", (store) =>
      store.put({
        key: this.scope + ":" + questionId,
        scope: this.scope,
        questionId,
        entry,
      }),
    );
  }
  async remove(questionId) {
    await this.run("readwrite", (store) =>
      store.delete(this.scope + ":" + questionId),
    );
  }
  async load() {
    return (
      await this.run("readonly", (store) =>
        store.index("scope").getAll(this.scope),
      )
    ).filter((e) => e.scope === this.scope);
  }
  close() {
    this.db?.close();
    this.db = null;
  }
}
