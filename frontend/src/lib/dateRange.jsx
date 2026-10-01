import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { RANGE_PRESETS } from '@product-lab/shared/constants';
import { addDays, autoGranularity, daysBetween, resolveRange, startOfDayIn, todayIn } from '@product-lab/shared/dates';
import { fmtRange } from './format.js';

const DateRangeContext = createContext(null);
const STORAGE_KEY = 'product-lab.range';
const DEFAULT = { preset: '30d', from: null, to: null, granularity: 'auto' };

function load() {
  try {
    return { ...DEFAULT, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return DEFAULT;
  }
}

function useToday(timezone) {
  const [today, setToday] = useState(() => todayIn(timezone));

  useEffect(() => {
    const refresh = () => setToday(todayIn(timezone));
    const timer = setTimeout(refresh, startOfDayIn(addDays(today, 1), timezone) - Date.now() + 1000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [today, timezone]);

  return today;
}

export function DateRangeProvider({ timezone, children }) {
  const [state, setState] = useState(load);
  const today = useToday(timezone);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable */
    }
  }, [state]);

  const value = useMemo(() => {
    const range = resolveRange(state.preset, today, state);
    const granularity = state.granularity === 'auto' ? autoGranularity(range) : state.granularity;
    const days = range.from && range.to ? daysBetween(range.from, range.to) + 1 : null;
    const preset = RANGE_PRESETS.find((p) => p.key === state.preset);
    return {
      preset: state.preset,
      today,
      range,
      days,
      granularity,
      granularityChoice: state.granularity,
      label: state.preset === 'custom' ? fmtRange(range) : (preset?.label ?? fmtRange(range)),
      comparisonLabel: days ? `vs previous ${days === 1 ? 'day' : `${days} days`}` : null,
      params: { from: range.from, to: range.to, granularity: state.preset === 'all' && state.granularity === 'auto' ? undefined : granularity },
      setPreset: (preset) => setState((s) => ({ ...s, preset })),
      setCustom: (from, to) => setState((s) => ({ ...s, preset: 'custom', from, to })),
      setGranularity: (granularity) => setState((s) => ({ ...s, granularity })),
    };
  }, [state, today]);

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
}

export const useDateRange = () => useContext(DateRangeContext);
