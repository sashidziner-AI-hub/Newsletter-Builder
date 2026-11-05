/**
 * "Auto" preset choice for a brief (6A) — maps the brief's `goal` onto the
 * preset whose own stated purpose (`PRESETS[].description`) fits it best.
 * Event, order and digest have no goal that maps onto them here; they stay
 * reachable through the preset selector's explicit list, same as any of the
 * other 8 — Auto only needs one best-fit answer per goal, not a mapping that
 * covers every preset.
 */

import type { BriefGoal } from './brief-types';

const AUTO_PRESET_BY_GOAL: Record<BriefGoal, string> = {
  inform: 'newsletter',
  promote: 'promotional',
  announce: 'product-launch',
  welcome: 'welcome',
  outreach: 'cold-outreach',
};

export function pickAutoPreset(goal: BriefGoal): string {
  return AUTO_PRESET_BY_GOAL[goal];
}
