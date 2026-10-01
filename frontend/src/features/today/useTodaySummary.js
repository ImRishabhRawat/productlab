import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PRODUCTIVITY_LABELS } from '@product-lab/shared/constants';
import { blockSpan, blockState, carryOver, clockIn, minutesToTime } from '@product-lab/shared/dates';
import { BLOCK_COLORS } from '../../components/charts/palette.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { useGet, useMutate } from '../../lib/queries.js';
import { useSettings } from '../../lib/session.js';
import { useNow } from '../../lib/useNow.js';

export const TODAY_KEY = ['get', '/productivity/today', {}];
export const LIVE = { refetchInterval: 300_000, refetchOnWindowFocus: true };
const EMPTY_OUTCOME = { title: '', done: false, goalId: null, productId: null, experimentId: null, tasks: [], completedBlocks: [] };

export const blockColor = (b) => BLOCK_COLORS[b.category] ?? BLOCK_COLORS.other;
export const blockLabel = (b) => PRODUCTIVITY_LABELS.blockCategory[b.category] ?? b.category;
export const blockEnd = (b) => (b.overnight ? `${b.end} (next day)` : b.end);
export const blockRange = (b) => (b.carry ? `since ${b.start} yesterday · until ${b.end}` : `${b.start}–${blockEnd(b)}`);
export const countsTowardProgress = (b) => b.category !== 'break' && !b.carry;
export const canComplete = (b) => countsTowardProgress(b) && b.state !== 'upcoming';

function schedule(data, clock) {
  const sameDay = data.date === clock.date;
  const minutes = sameDay ? clock.minutes : data.date < clock.date ? Infinity : -Infinity;
  const completed = new Set((data.outcome?.completedBlocks ?? []).map(String));
  const left = sameDay && data.current ? carryOver(data.current, minutes) : null;
  const carried = left == null ? [] : [{ ...data.current, carry: true, elapsed: 1 - left / data.current.minutes, remaining: left }];
  const blocks = [
    ...carried,
    ...data.blocks.map((b) => {
      const span = blockSpan(b);
      const state = blockState(b, minutes);
      return {
        ...b,
        state,
        completed: completed.has(String(b._id)),
        overnight: span.to > 1440,
        elapsed: state === 'current' ? (minutes - span.from) / span.minutes : null,
        remaining: span.to - minutes,
        startsIn: span.from - minutes,
      };
    }),
  ];
  return {
    blocks,
    current: blocks.filter((b) => b.state === 'current').at(-1) ?? null,
    next: blocks.find((b) => b.state === 'upcoming') ?? null,
    ended: sameDay && Boolean(data.current) && left == null && blockState(data.current, minutes) !== 'current',
  };
}

export function useTodaySummary() {
  const { data: settings } = useSettings();
  const now = useNow();
  const query = useGet('/productivity/today', null, LIVE);
  const clock = clockIn(now, settings.timezone);
  const { data, refetch } = query;
  const { ended, ...plan } = data ? schedule(data, clock) : { blocks: [], current: null, next: null };
  const stale = Boolean(data) && (data.date !== clock.date || ended);

  useEffect(() => {
    if (stale) refetch();
  }, [stale, refetch]);

  return { query, data, now, clock, time: minutesToTime(clock.minutes), ...plan };
}

export function useTodayMutation(fn, optimistic, queryKey = TODAY_KEY) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutate(fn, {
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, (d) => d && optimistic(d, vars));
    },
    onError: (err) => {
      toast.error(err);
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

export function useSaveOutcome(date) {
  return useTodayMutation(
    ({ names, ...body }) => api(`/daily-outcomes/${date}`, { method: 'PUT', body }),
    (d, { names, ...body }) => ({ ...d, outcome: { ...EMPTY_OUTCOME, date: d.date, ...d.outcome, ...body, ...names } }),
  );
}

export const toggleBlock = (outcome, id) => {
  const ids = (outcome?.completedBlocks ?? []).map(String);
  return { completedBlocks: ids.includes(String(id)) ? ids.filter((x) => x !== String(id)) : [...ids, String(id)] };
};
