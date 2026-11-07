// Gesture rules for `SwipeRow` (TB-27). Pure worklet functions, unit-tested in Jest.
//
// Why not gesture-handler's ReanimatedSwipeable: its pan only sets `activeOffsetX`, so a
// mostly-vertical drag that drifts 10 pt sideways activated it and completed a task while the
// user was scrolling (device finding on PR #17). It exposes no `failOffsetY`.

export type SwipeSide = 'left' | 'right';

/** Horizontal travel (pt) before the row starts following the finger. */
export const SWIPE_ACTIVATION_DISTANCE = 20;
/** Vertical travel (pt) that fails the row gesture before it activates, so the list scrolls. */
export const SWIPE_VERTICAL_FAIL_DISTANCE = 12;
/** Release past this distance to commit; less springs back. */
export const SWIPE_COMMIT_DISTANCE = 72;
/** Width of the action panel; dragging further meets resistance. */
export const SWIPE_PANEL_WIDTH = 120;
/** Overshoot past the panel moves 1/8 as far as the finger. */
export const SWIPE_OVERSHOOT_FRICTION = 8;
/** Share of the release velocity (pt/s) added to the distance, so a quick flick commits. */
export const SWIPE_VELOCITY_TOSS = 0.05;

/** Pan activation rules: horizontal intent first, any earlier vertical move fails the row. */
export const SWIPE_PAN_OFFSETS = {
  activeOffsetX: [-SWIPE_ACTIVATION_DISTANCE, SWIPE_ACTIVATION_DISTANCE] as [number, number],
  failOffsetY: [-SWIPE_VERTICAL_FAIL_DISTANCE, SWIPE_VERTICAL_FAIL_DISTANCE] as [number, number],
};

/** Where the row sits for a finger at `translationX` (no panel on a side = no movement there). */
export function swipeRowOffset(
  translationX: number,
  hasLeftPanel: boolean,
  hasRightPanel: boolean,
): number {
  'worklet';
  if ((translationX > 0 && !hasLeftPanel) || (translationX < 0 && !hasRightPanel)) return 0;
  const distance = Math.abs(translationX);
  const offset =
    distance <= SWIPE_PANEL_WIDTH
      ? distance
      : SWIPE_PANEL_WIDTH + (distance - SWIPE_PANEL_WIDTH) / SWIPE_OVERSHOOT_FRICTION;
  return Math.sign(translationX) * offset;
}

/**
 * Which way the swipe committed on release, or null. The side is where the finger moved
 * (`right` uncovers the left panel). A release that ends more vertical than horizontal never
 * commits, even if the row had activated.
 */
export function resolveSwipe(
  release: { translationX: number; translationY: number; velocityX: number },
  hasLeftPanel: boolean,
  hasRightPanel: boolean,
): SwipeSide | null {
  'worklet';
  const { translationX, translationY, velocityX } = release;
  if (Math.abs(translationY) >= Math.abs(translationX)) return null;
  const projected = translationX + SWIPE_VELOCITY_TOSS * velocityX;
  // The finger must also end on the side it is committing to (a flick back cancels).
  if (projected >= SWIPE_COMMIT_DISTANCE && translationX > 0 && hasLeftPanel) return 'right';
  if (projected <= -SWIPE_COMMIT_DISTANCE && translationX < 0 && hasRightPanel) return 'left';
  return null;
}
