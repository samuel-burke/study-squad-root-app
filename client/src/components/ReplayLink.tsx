/** The small "Replay" link under an unlock's Nice! button: plays the moment again from the start. */
export function ReplayLink({ onReplay }: { onReplay(): void }) {
  return (
    <button
      type="button"
      className="link-btn unlock-replay"
      onClick={(e) => {
        // The backdrop dismisses; replaying must not.
        e.stopPropagation();
        onReplay();
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </svg>
      Replay
    </button>
  );
}
