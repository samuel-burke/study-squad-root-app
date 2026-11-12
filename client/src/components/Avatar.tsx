import { useEffect, useState } from "react";
import type { Profile } from "../api/gateway";
import { cachedAvatar, saveAvatar } from "../lib/avatarCache";
import { avatarColor, initials } from "../lib/view";

const YOU_COLOR = "#5B6B2E";
/** First wait before trying a picture that failed to load again; doubles each time. */
export const AVATAR_RETRY_MS = 5_000;
const AVATAR_RETRY_MAX_MS = 60_000;

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
  const color = you ? YOU_COLOR : avatarColor(userId);
  const picture = usePicture(url);
  // The last copy that loaded sits behind the live picture, so it shows while
  // that loads and whenever it fails, but not once someone removes their picture.
  const backup = profile && !url ? undefined : cachedAvatar(userId);
  const fallback = you ? "YOU" : profile ? initials(profile.name ?? "") : "";
  return (
    <span
      className="avatar"
      style={{ background: backup ? `center / cover url("${backup}"), ${color}` : color }}
      aria-hidden="true"
    >
      {url && picture.show ? (
        <img
          key={picture.attempt}
          src={url}
          alt=""
          onLoad={() => saveAvatar(userId, url, color)}
          onError={picture.failed}
        />
      ) : backup ? null : (
        fallback
      )}
    </span>
  );
}

/**
 * Root's picture links sometimes fail to load, often on mobile (the browser then
 * draws a broken image, which looks like a "?"). Hide it and keep trying, waiting
 * a little longer each time.
 */
function usePicture(url: string | undefined) {
  const [state, setState] = useState({ url, attempt: 0, broken: false });
  const current = state.url === url ? state : { url, attempt: 0, broken: false };
  if (current !== state) setState(current);

  useEffect(() => {
    if (!current.broken) return;
    const wait = Math.min(AVATAR_RETRY_MS * 2 ** current.attempt, AVATAR_RETRY_MAX_MS);
    const next = current.attempt + 1;
    const timer = setTimeout(
      () => setState((s) => (s.url === url ? { url, attempt: next, broken: false } : s)),
      wait,
    );
    return () => clearTimeout(timer);
  }, [current.broken, current.attempt, url]);

  return {
    show: !current.broken,
    attempt: current.attempt,
    failed: () => setState((s) => (s.url === url ? { ...s, broken: true } : s)),
  };
}
