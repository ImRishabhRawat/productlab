import { LABELS, PRODUCTIVITY_LABELS } from '@product-lab/shared/constants';

export const TONES = {
  gray: '#8e8b82',
  blue: '#2a78d6',
  orange: '#eb6834',
  aqua: '#1baf7a',
  yellow: '#eda100',
  green: '#008300',
  violet: '#4a3aa7',
  red: '#d03b3b',
  sand: '#b5aea2',
};

const MAPS = {
  status: {
    idea: TONES.gray,
    researching: TONES.violet,
    ready_to_test: TONES.yellow,
    testing: TONES.blue,
    iterating: TONES.orange,
    scaling: TONES.green,
    paused: TONES.sand,
    killed: TONES.red,
    converted: TONES.aqua,
  },
  experimentStatus: { planned: TONES.gray, running: TONES.blue, completed: TONES.green, stopped: TONES.red },
  decision: { continue: TONES.blue, iterate: TONES.orange, scale: TONES.green, pause: TONES.sand, kill: TONES.red },
  paymentStatus: { paid: TONES.green, pending: TONES.yellow, failed: TONES.red },
  refundStatus: { none: TONES.gray, partial: TONES.orange, full: TONES.red },
  level: { low: TONES.green, medium: TONES.yellow, high: TONES.red },
  goalStatus: { active: TONES.blue, achieved: TONES.green, paused: TONES.sand, dropped: TONES.gray },
};

export function statusMeta(kind, value) {
  return { color: MAPS[kind]?.[value] ?? TONES.gray, label: LABELS[kind]?.[value] ?? PRODUCTIVITY_LABELS[kind]?.[value] ?? value };
}
