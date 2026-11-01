import {
  availableBadges,
  badgeById,
  CARD_STYLES,
  isCardStyleUnlocked,
  SHOWCASE_SIZE,
  type BadgeCategory,
  type BadgeDefinition,
  type CardLookDto,
  type EarnedBadgeDto,
} from "@studyroom/core";
import { useState } from "react";
import { BadgeMedal } from "./BadgeMedal";

const CATEGORY_TITLES: Record<BadgeCategory, string> = {
  streak: "Streaks",
  level: "Levels",
  focus: "Focus",
  room: "Room and combo",
  goals: "Goals",
  boss: "Weekly boss",
  quests: "Weekly quests",
  leaderboard: "Leaderboard",
  secret: "Secret badges",
};

const earnedDate = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/**
 * Every badge, grouped by category. Locked badges are dimmed and say how to
 * earn them; secret ones stay "?" until someone finds them. Tapping a badge
 * shows its details in the row right below it, and earned ones can be
 * replayed or pinned to your card.
 */
export function BadgeShelf({
  earned,
  card,
  busy,
  onShowcase,
  onReplay,
}: {
  earned: EarnedBadgeDto[];
  card: CardLookDto;
  busy: boolean;
  onShowcase(badgeIds: string[]): void;
  /** Plays an earned badge's full-screen unlock moment again. */
  onReplay?(badgeId: string): void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const earnedAt = new Map(earned.map((b) => [b.id, b.earnedAt]));
  const catalog = availableBadges();
  const groups = new Map<BadgeCategory, BadgeDefinition[]>();
  for (const badge of catalog)
    groups.set(badge.category, [...(groups.get(badge.category) ?? []), badge]);

  const secrets = catalog.filter((b) => b.secret);
  const secretsFound = secrets.filter((b) => earnedAt.has(b.id)).length;
  const visibleTotal = catalog.length - secrets.length;
  const visibleEarned = catalog.filter((b) => !b.secret && earnedAt.has(b.id)).length;

  const pinned = card.chosenShowcase;
  const togglePin = (id: string) => {
    const base = pinned.length > 0 ? pinned : card.showcase;
    onShowcase(
      base.includes(id) ? base.filter((b) => b !== id) : [...base, id].slice(-SHOWCASE_SIZE),
    );
  };

  const detail = selected ? badgeById(selected) : undefined;
  const detailEarned = selected ? earnedAt.get(selected) : undefined;

  const detailRow = (badge: BadgeDefinition) => (
    <li key={`${badge.id}-detail`} className="badge-detail-row">
      <div className="badge-detail" role="region" aria-label="Badge details">
        {badge.secret && detailEarned === undefined ? (
          <>
            <strong>A secret badge</strong>
            <span className="small muted">
              Nobody tells you how to get these. Keep studying and see what happens.
            </span>
          </>
        ) : (
          <>
            <div className="badge-detail-head">
              <BadgeMedal badge={badge} size={44} locked={detailEarned === undefined} />
              <strong>{badge.name}</strong>
              {onReplay && detailEarned !== undefined && (
                <button
                  type="button"
                  className="link-btn small badge-detail-replay"
                  onClick={() => onReplay(badge.id)}
                >
                  Replay
                </button>
              )}
            </div>
            <span className="small muted">{badge.description}</span>
            {detailEarned !== undefined ? (
              <div className="row-between small">
                <span className="dim">Earned {earnedDate(detailEarned)}</span>
                <button
                  type="button"
                  className="link-btn"
                  disabled={busy}
                  onClick={() => togglePin(badge.id)}
                >
                  {card.showcase.includes(badge.id) ? "Take off my card" : "Show on my card"}
                </button>
              </div>
            ) : (
              <span className="small dim">Not earned yet</span>
            )}
          </>
        )}
      </div>
    </li>
  );

  return (
    <section className="card" aria-label="Badges">
      <div className="row-between">
        <h2 style={{ fontSize: 16 }}>Badges</h2>
        <span className="tiny dim tabular">
          {visibleEarned} of {visibleTotal} · {secretsFound} of {secrets.length} secrets
        </span>
      </div>

      <div className="showcase" aria-label="On your card">
        <span className="small muted">On your card</span>
        <div className="showcase-badges">
          {card.showcase.length === 0 ? (
            <span className="small dim">Earn a badge to show it here</span>
          ) : (
            card.showcase.flatMap((id) => {
              const badge = badgeById(id);
              return badge
                ? [
                    <span key={id} className="badge-pill">
                      <BadgeMedal badge={badge} size={22} />
                      {badge.name}
                    </span>,
                  ]
                : [];
            })
          )}
        </div>
        {pinned.length > 0 && (
          <button
            type="button"
            className="link-btn small"
            disabled={busy}
            onClick={() => onShowcase([])}
          >
            Show my newest instead
          </button>
        )}
      </div>

      {[...groups.entries()].map(([category, badges]) => (
        <div key={category} className="badge-group">
          <h3 className="badge-group-title">{CATEGORY_TITLES[category]}</h3>
          <ul className="badge-grid badge-grid-shelf">
            {badges.flatMap((badge) => {
              const has = earnedAt.has(badge.id);
              const hidden = badge.secret === true && !has;
              const label = hidden
                ? "Secret badge, not found yet"
                : `${badge.name}${has ? ", earned" : ", locked"}`;
              const tile = (
                <li key={badge.id}>
                  <button
                    type="button"
                    className="badge-tile"
                    data-earned={has}
                    data-secret={badge.secret === true}
                    aria-pressed={selected === badge.id}
                    aria-label={label}
                    onClick={() => setSelected(selected === badge.id ? null : badge.id)}
                  >
                    <BadgeMedal badge={badge} size={52} locked={!has} />
                    <span className="badge-name">{hidden ? "???" : badge.name}</span>
                  </button>
                </li>
              );
              // The details take a full row of their own, right below the tapped badge.
              return detail?.id === badge.id ? [tile, detailRow(detail)] : [tile];
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** Card borders and colours. Most unlock with level, a few with a badge. */
export function CardStylePicker({
  level,
  earned,
  card,
  busy,
  onPick,
}: {
  level: number;
  earned: EarnedBadgeDto[];
  card: CardLookDto;
  busy: boolean;
  onPick(style: string): void;
}) {
  const held = new Set(earned.map((b) => b.id));
  return (
    <section className="card" aria-label="Card style">
      <div className="row-between">
        <h2 style={{ fontSize: 16 }}>Card style</h2>
        <span className="tiny dim">What others see on the board</span>
      </div>
      <ul className="style-grid" role="radiogroup" aria-label="Card style">
        <li>
          <button
            type="button"
            role="radio"
            className="style-swatch"
            data-style={card.chosenStyle === "" ? card.style : "classic"}
            aria-checked={card.chosenStyle === ""}
            disabled={busy}
            onClick={() => onPick("")}
          >
            <span className="style-name">Automatic</span>
            <span className="tiny dim">Best for your level</span>
          </button>
        </li>
        {CARD_STYLES.map((style) => {
          const unlocked = isCardStyleUnlocked(style, level, held);
          const badge = "badge" in style.unlock ? badgeById(style.unlock.badge) : undefined;
          // A style behind a secret badge doesn't say which badge until you have it.
          const lock =
            "level" in style.unlock
              ? `Level ${style.unlock.level}`
              : badge?.secret
                ? "Secret badge"
                : `${badge?.name ?? "A badge"} badge`;
          return (
            <li key={style.id}>
              <button
                type="button"
                role="radio"
                className="style-swatch"
                data-style={style.id}
                data-locked={!unlocked}
                aria-checked={card.chosenStyle === style.id}
                disabled={busy || !unlocked}
                onClick={() => onPick(style.id)}
              >
                <span className="style-name">{style.name}</span>
                <span className="tiny dim">{unlocked ? "Unlocked" : lock}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
