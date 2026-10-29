/**
 * Online status is DERIVED at read time from lastSeenAt — we never run a cron
 * to flip thousands of documents. A device is online if it checked in within
 * heartbeatMinutes * graceMultiplier.
 */
export function isOnline(lastSeenAt, heartbeatMinutes, graceMultiplier) {
  if (!lastSeenAt) return false;
  const windowMs = heartbeatMinutes * 60 * 1000 * graceMultiplier;
  return Date.now() - new Date(lastSeenAt).getTime() < windowMs;
}

/** Cutoff Date used to build an indexed Mongo query for online/offline filters. */
export function onlineCutoff(heartbeatMinutes, graceMultiplier) {
  const windowMs = heartbeatMinutes * 60 * 1000 * graceMultiplier;
  return new Date(Date.now() - windowMs);
}
