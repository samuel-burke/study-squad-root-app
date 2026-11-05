import { useEffect, useMemo, useState } from "react";
import type { Profile, StudyRoomGateway } from "../api/gateway";

/** First wait before asking Root again after a failed lookup; doubles each time. */
export const PROFILE_RETRY_MS = 2_000;
const PROFILE_RETRY_MAX_MS = 60_000;

/** Looks up names and avatars for user ids, fetching only ones it hasn't seen. */
export function useProfiles(
  gateway: StudyRoomGateway,
  userIds: readonly string[],
): Map<string, Profile> {
  const [profiles, setProfiles] = useState<Map<string, Profile>>(() => new Map());
  // Bumped after a failed lookup so the effect runs again; without it a single
  // failed call left names and pictures blank until someone joined or left.
  const [failures, setFailures] = useState(0);
  const key = useMemo(() => [...new Set(userIds)].sort().join("|"), [userIds]);

  useEffect(() => {
    const missing = key.split("|").filter((id) => id && !profiles.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    gateway
      .getProfiles(missing)
      .then((found) => {
        if (cancelled) return;
        setFailures(0);
        setProfiles((current) => {
          const next = new Map(current);
          for (const profile of found) next.set(profile.userId, profile);
          // Remember misses too, so a deleted account isn't fetched on every render.
          for (const id of missing) if (!next.has(id)) next.set(id, { userId: id, name: "Member" });
          return next;
        });
      })
      .catch(() => {
        if (cancelled) return;
        const wait = Math.min(PROFILE_RETRY_MS * 2 ** failures, PROFILE_RETRY_MAX_MS);
        retry = setTimeout(() => setFailures((n) => n + 1), wait);
      });
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [gateway, key, profiles, failures]);

  return profiles;
}
