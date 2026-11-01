import type { Profile } from "../api/gateway";
import { avatarColor, initials } from "../lib/view";

const YOU_COLOR = "#5B6B2E";

export function Avatar({
  userId,
  profile,
  you = false,
}: {
  userId: string;
  profile?: Profile;
  you?: boolean;
}) {
  const name = you ? "You" : (profile?.name ?? "");
  return (
    <span
      className="avatar"
      style={{ background: you ? YOU_COLOR : avatarColor(userId) }}
      aria-hidden="true"
    >
      {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : you ? "YOU" : initials(name)}
    </span>
  );
}
