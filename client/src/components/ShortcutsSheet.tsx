import { SHORTCUT_GROUPS } from "../lib/shortcuts";
import { Sheet } from "./Sheet";

/** The "?" list of keyboard shortcuts. */
export function ShortcutsSheet({ onClose }: { onClose(): void }) {
  return (
    <Sheet labelledBy="shortcuts-title" onClose={onClose} className="sheet-wide shortcuts-sheet">
      <h1 id="shortcuts-title">Keyboard shortcuts</h1>
      <div className="shortcut-groups">
        {SHORTCUT_GROUPS.map((group, i) => (
          <section key={group.title} aria-labelledby={`keys-${i}`}>
            <h2 id={`keys-${i}`} className="shortcut-group-title">
              {group.title}
            </h2>
            <dl>
              {group.rows.map(([label, keys]) => (
                <div key={label} className="shortcut-row">
                  <dt>{label}</dt>
                  <dd>
                    {keys.map((k, i) => (
                      <kbd key={i}>{k}</kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="tiny dim" style={{ margin: 0 }}>
        Shortcuts pause while you type. Root's own shortcuts (Ctrl and ⌘ keys) still work.
      </p>
      <button type="button" className="btn" onClick={onClose} data-autofocus>
        Close
      </button>
    </Sheet>
  );
}
