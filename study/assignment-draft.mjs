// One in-flight writer per mounted draft; server revisions arbitrate across tabs/devices.
// Persist immediately on edit. Never clear a newer edit when an older save returns.
export function createAssignmentDraft({
  snapshot,
  storage,
  key,
  save,
  notify = () => {},
}) {
  let revision = snapshot.revision,
    current = snapshot,
    changes = {},
    conflict = false;
  let running = null,
    active = true,
    storageFailed = false;
  try {
    const stored = JSON.parse(storage.getItem(key) || "null");
    if (
      stored?.attemptId === snapshot.attempt_id &&
      stored.answers &&
      typeof stored.answers === "object" &&
      !Array.isArray(stored.answers)
    ) {
      const remote = Object.fromEntries(
        snapshot.answers.map((a) => [a.question.id, a.answer]),
      );
      const known = new Set(Object.keys(remote));
      changes = Object.fromEntries(
        Object.entries(stored.answers).filter(([id]) => known.has(id)),
      );
      // Recover a response lost after the server already accepted the saved answers.
      if (
        Object.entries(changes).every(
          ([id, value]) => JSON.stringify(remote[id]) === JSON.stringify(value),
        )
      )
        changes = {};
      else if (stored.revision !== revision) conflict = true;
    }
  } catch {
    storageFailed = true;
  }
  function persist() {
    try {
      if (!Object.keys(changes).length) storage.removeItem(key);
      else
        storage.setItem(
          key,
          JSON.stringify({
            attemptId: snapshot.attempt_id,
            revision,
            answers: changes,
          }),
        );
      storageFailed = false;
    } catch {
      storageFailed = true;
    }
  }
  function status(error) {
    notify({
      pending: Object.keys(changes).length > 0,
      conflict,
      storageFailed,
      error,
      snapshot: current,
    });
  }
  function edit(id, answer) {
    if (!active || current.state !== "draft") return;
    changes[id] = answer;
    persist();
    status();
  }
  async function flush() {
    if (running) return running;
    if (conflict) throw Error("VERSION_CONFLICT");
    if (!active) throw Error("ACCOUNT_CHANGED");
    running = (async () => {
      while (
        active &&
        current.state === "draft" &&
        Object.keys(changes).length
      ) {
        const sent = structuredClone(changes);
        try {
          const updated = await save({
            attempt_id: current.attempt_id,
            revision,
            answers: sent,
          });
          if (!active) throw Error("ACCOUNT_CHANGED");
          current = updated;
          revision = updated.revision;
          if (updated.state !== "draft") {
            // Preserve any unsent/late input locally for explicit review; it is not part of the submission.
            persist();
            status();
            break;
          }
          for (const [id, value] of Object.entries(sent)) {
            if (JSON.stringify(changes[id]) === JSON.stringify(value))
              delete changes[id];
          }
          persist();
          status();
        } catch (error) {
          if (error.code === "40001" || error.message === "VERSION_CONFLICT")
            conflict = true;
          persist();
          status(error);
          throw error;
        }
      }
      return current;
    })();
    try {
      return await running;
    } finally {
      running = null;
    }
  }
  status();
  return {
    edit,
    flush,
    get snapshot() {
      return current;
    },
    get pending() {
      return structuredClone(changes);
    },
    get conflicted() {
      return conflict;
    },
    dispose() {
      active = false;
      persist();
    },
  };
}
