/**
 * Returns true when newMeta carries a last_success_at timestamp that differs
 * from oldMeta's — meaning the server has committed fresh data since our last
 * snapshot. If newMeta has no timestamp (fetch partial / server error), we
 * treat the result as "unknown" and skip the full reload.
 */
export function hasMetaChanged(oldMeta, newMeta) {
  return Boolean(newMeta?.last_success_at && newMeta.last_success_at !== oldMeta?.last_success_at);
}
