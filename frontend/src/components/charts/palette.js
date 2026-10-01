export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

export const METRIC_COLORS = { revenue: SERIES[0], spend: SERIES[1], contribution: SERIES[2], focus: SERIES[6] };

export const ORDER_KIND_COLORS = { main: SERIES[0], bump: SERIES[4], upsell: SERIES[6], bundle: SERIES[3] };

export const ORDINAL = ['#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

export const SEQUENTIAL = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];

export const TRACK = '#dfeaf8';

export const DIVERGING = { negative: '#e34948', neutral: '#e6dfd8', positive: '#2a78d6' };

export const STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };

export const MUTED = '#cbc4b7';

export const CHART = {
  surface: '#faf9f5',
  grid: '#ebe6df',
  axis: '#d6cfc3',
  tick: '#6c6a64',
  ink: '#141413',
  label: '#3d3d3a',
  spark: '#b9b2a5',
};

export const BLOCK_COLORS = {
  business: SERIES[0],
  product: SERIES[1],
  learning: SERIES[6],
  fitness: SERIES[2],
  personal: CHART.spark,
  review: CHART.spark,
  other: CHART.spark,
  break: MUTED,
};

export const AXIS_TICK = { fill: CHART.tick, fontSize: 12 };

export const sequentialColor = (value, max) => {
  if (!max || !value) return SEQUENTIAL[0];
  const i = Math.min(SEQUENTIAL.length - 1, Math.max(0, Math.round((value / max) * (SEQUENTIAL.length - 1))));
  return SEQUENTIAL[i];
};
