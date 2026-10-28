/**
 * Starts a page's data load from an effect: `useEffect(() => startLoad(fetchData), [fetchData])`.
 *
 * The load runs a microtask after the effect rather than inside it, so a
 * loader that sets `loading` before its first await is not setting state
 * during the effect (react-hooks/set-state-in-effect) — it lands before the
 * next paint all the same. The returned cleanup marks the run cancelled: a
 * loader that takes `isCancelled` can drop a slow response for the previous
 * record instead of letting it overwrite the current one, and a run cleaned
 * up before its microtask never starts at all.
 */
export function startLoad(load: (isCancelled: () => boolean) => unknown): () => void {
  let cancelled = false;
  queueMicrotask(() => {
    if (!cancelled) load(() => cancelled);
  });
  return () => {
    cancelled = true;
  };
}
