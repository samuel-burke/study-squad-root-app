import { useEffect, useState } from "react";
import type { Profile } from "../api/gateway";
import { avatarColor, initials } from "../lib/view";

const YOU_COLOR = "#5B6B2E";
/** How long to wait before trying a picture that failed to load one more time. */
export const AVATAR_RETRY_MS = 5_000;

export function Avatar({
  userId,
  profile,
  you = false,
}: {
  userId: string;
  profile?: Profile;
  you?: boolean;
}) {
  const url = profile?.avatarUrl;
  const picture = usePicture(url);
  const fallback = you ? "YOU" : profile ? initials(profile.name ?? "") : "";
  return (
    <span
      className="avatar"
      style={{ background: you ? YOU_COLOR : avatarColor(userId) }}
      aria-hidden="true"
    >
      {url && picture.show ? (
        <img key={picture.attempt} src={url} alt="" onError={picture.failed} />
      ) : (
        fallback
      )}
    </span>
  );
}

/**
 * Root's picture links sometimes fail to load (the browser then draws a broken
 * image, which looks like a "?"). Show initials instead, and try the picture
 * once more a few seconds later in case the failure was a passing hiccup.
 */
function usePicture(url: string | undefined) {
  const [state, setState] = useState({ url, attempt: 0, broken: false });
  const current = state.url === url ? state : { url, attempt: 0, broken: false };
  if (current !== state) setState(current);

  useEffect(() => {
    if (!current.broken || current.attempt > 0) return;
    const timer = setTimeout(
      () => setState((s) => (s.url === url ? { url, attempt: 1, broken: false } : s)),
      AVATAR_RETRY_MS,
    );
    return () => clearTimeout(timer);
  }, [current.broken, current.attempt, url]);

  return {
    show: !current.broken,
    attempt: current.attempt,
    failed: () => setState((s) => (s.url === url ? { ...s, broken: true } : s)),
  };
}
