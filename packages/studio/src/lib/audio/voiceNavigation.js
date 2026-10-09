/**
 * Keyboard navigation for the preset voice picker's listbox.
 *
 * The picker is a combobox: the search field keeps DOM focus while a virtual
 * "active option" moves through the visible voices, which is what
 * `aria-activedescendant` describes. Keeping the decision table here — rather
 * than inline in the component — means the arrow/Enter/Escape behaviour can be
 * tested directly, which matters because this suite has no DOM.
 *
 * Framework-free and side-effect free.
 */

export const VOICE_KEY_ACTION_TYPES = Object.freeze({
  MOVE: "move",
  SELECT: "select",
  CLOSE: "close",
  NONE: "none",
});

const NONE = Object.freeze({ type: VOICE_KEY_ACTION_TYPES.NONE });

/**
 * Force an index into range. Returns -1 when there is nothing to point at, so a
 * caller can never leave `aria-activedescendant` pointing at a missing option.
 */
export function clampVoiceIndex(index, count) {
  const total = Number.isFinite(count) ? Math.trunc(count) : 0;
  if (total <= 0) return -1;
  const last = total - 1;
  if (!Number.isFinite(index)) return 0;
  const value = Math.trunc(index);
  if (value < 0) return 0;
  if (value > last) return last;
  return value;
}

/**
 * Move the active option by `delta`, clamped at both ends — arrowing past the
 * last voice stops rather than wrapping, so the list cannot jump under the
 * operator. With nothing active yet, Down lands on the first voice and Up on
 * the last, which is the documented listbox behaviour.
 */
export function moveVoiceIndex(activeIndex, delta, count) {
  const total = Number.isFinite(count) ? Math.trunc(count) : 0;
  if (total <= 0) return -1;
  const step = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  const start = Number.isFinite(activeIndex) ? Math.trunc(activeIndex) : -1;
  if (start < 0) return step > 0 ? 0 : total - 1;
  return clampVoiceIndex(start + step, total);
}

/**
 * Where the active option starts when the list opens or the query changes: the
 * current voice when it is still visible, otherwise the first result.
 */
export function initialActiveIndex(voices, selectedId) {
  const list = Array.isArray(voices) ? voices : [];
  if (list.length === 0) return -1;
  const index = list.findIndex((voice) => voice?.id === selectedId);
  return index >= 0 ? index : 0;
}

/** The DOM id of one option, matching the picker's `aria-activedescendant`. */
export function optionDomId(listboxId, index) {
  return `${listboxId}-option-${index}`;
}

/**
 * The whole key map in one place. `count` is the number of *visible* options, so
 * a filtered search narrows navigation with it.
 */
export function resolveVoiceKeyAction({ key, count, activeIndex }) {
  const total = Number.isFinite(count) ? Math.trunc(count) : 0;
  switch (key) {
    case "ArrowDown":
      return total > 0
        ? { type: VOICE_KEY_ACTION_TYPES.MOVE, index: moveVoiceIndex(activeIndex, 1, total) }
        : NONE;
    case "ArrowUp":
      return total > 0
        ? { type: VOICE_KEY_ACTION_TYPES.MOVE, index: moveVoiceIndex(activeIndex, -1, total) }
        : NONE;
    case "Enter":
      return Number.isFinite(activeIndex) && activeIndex >= 0 && activeIndex < total
        ? { type: VOICE_KEY_ACTION_TYPES.SELECT, index: activeIndex }
        : NONE;
    case "Escape":
      return { type: VOICE_KEY_ACTION_TYPES.CLOSE };
    default:
      return NONE;
  }
}
