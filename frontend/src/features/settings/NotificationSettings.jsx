import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PRODUCTIVITY_LABELS, PURCHASE_MILESTONES, WEEKDAYS } from '@product-lab/shared/constants';
import { TIME_RE } from '@product-lab/shared/dates';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Input, Select, Switch } from '../../components/ui/Field.jsx';
import { ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { EnableNotifications } from '../notifications/EnableNotifications.jsx';

const PREFS_KEY = ['get', '/notification-preferences', {}];
const SAVE_KEY = ['notification-preferences'];
const WEEKDAY_OPTIONS = WEEKDAYS.map((d) => ({ value: String(d), label: PRODUCTIVITY_LABELS.weekday[d] }));
const LAST_WEEK_REVIEW_DAYS = [1, 2, 3];
const MILESTONES = `${PURCHASE_MILESTONES.slice(0, 4).join(', ')}…`;

const merge = (prefs, patch) => ({ ...prefs, ...patch, business: { ...prefs.business, ...patch.business } });

function previousValues(prefs, { business, ...rest }) {
  const undo = Object.fromEntries(Object.keys(rest).map((key) => [key, prefs[key]]));
  if (business) undo.business = Object.fromEntries(Object.keys(business).map((key) => [key, prefs.business?.[key]]));
  return undo;
}

function useSavePrefs() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { mutate } = useMutation({
    mutationKey: SAVE_KEY,
    mutationFn: (patch) => api('/notification-preferences', { method: 'PATCH', body: patch }),
    onMutate: (patch) => {
      queryClient.cancelQueries({ queryKey: PREFS_KEY });
      const prefs = queryClient.getQueryData(PREFS_KEY);
      if (!prefs) return {};
      queryClient.setQueryData(PREFS_KEY, merge(prefs, patch));
      return { undo: previousValues(prefs, patch) };
    },
    onError: (err, _patch, context) => {
      if (context?.undo) queryClient.setQueryData(PREFS_KEY, (prefs) => prefs && merge(prefs, context.undo));
      toast.error(err);
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: SAVE_KEY }) === 1) queryClient.invalidateQueries({ queryKey: PREFS_KEY });
    },
  });
  return mutate;
}

function SwitchRow({ label, description, checked, onChange, children }) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-48">
        <label id={`${id}-label`} htmlFor={id} className="cursor-pointer text-[13.5px] font-medium text-ink">
          {label}
        </label>
        <p id={`${id}-hint`} className="mt-0.5 text-xs text-muted">
          {description}
        </p>
      </div>
      {children && (
        <div
          className={`order-last flex w-full flex-wrap items-center gap-2 transition-opacity sm:order-none sm:w-auto ${checked ? '' : 'opacity-60'}`}
        >
          {children}
        </div>
      )}
      <Switch
        id={id}
        checked={checked}
        onChange={onChange}
        className="-my-1 -mr-1.5 w-12 justify-center"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
      />
    </div>
  );
}

function TimeInput({ value, label, onCommit }) {
  const [draft, setDraft] = useState(null);
  const commit = () => {
    if (draft !== null && TIME_RE.test(draft) && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <div className="w-28">
      <Input
        type="time"
        aria-label={label}
        value={draft ?? value ?? ''}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </div>
  );
}

function Group({ title, description, children }) {
  return (
    <section className="border-t border-hairline pt-4">
      <h3 className="text-xs font-semibold tracking-[0.06em] text-muted uppercase">{title}</h3>
      {description && <p className="mt-1 text-xs text-muted">{description}</p>}
      <div className="divide-y divide-hairline-soft">{children}</div>
    </section>
  );
}

function Preferences({ prefs }) {
  const save = useSavePrefs();
  const toggle = (key) => ({ checked: Boolean(prefs[key]), onChange: (value) => save({ [key]: value }) });
  const businessAlert = (key) => ({
    checked: Boolean(prefs.business?.[key]),
    onChange: (value) => save({ business: { [key]: value } }),
  });
  const time = (key, label) => <TimeInput value={prefs[key]} label={label} onCommit={(value) => save({ [key]: value })} />;

  return (
    <div className="mt-4 space-y-4">
      <div className="border-t border-hairline pt-1">
        <SwitchRow
          label="All notifications"
          description="Off pauses every reminder and alert, in the app and on your devices."
          {...toggle('enabled')}
        />
        {!prefs.enabled && <p className="pb-2 text-xs text-muted">Everything below is paused. Your choices are kept for when you switch back on.</p>}
      </div>
      <div className={`space-y-4 transition-opacity ${prefs.enabled ? '' : 'opacity-50'}`}>
        <Group title="Schedule">
          <SwitchRow
            label="Reminder before a block"
            description="A heads-up before a block starts. Set the lead time per block in Plan."
            {...toggle('blockReminder')}
          />
          <SwitchRow label="Block start" description="When a block begins, with today's #1 outcome." {...toggle('blockStart')} />
          <SwitchRow label="Block ending" description="Shortly before a block ends, to wrap up. Timing is set per block." {...toggle('blockEnd')} />
        </Group>
        <Group title="Daily">
          <SwitchRow label="#1 outcome reminder" description="Morning nudge to set or start today's #1 outcome." {...toggle('dailyOutcome')}>
            {time('dailyOutcomeTime', '#1 outcome reminder time')}
          </SwitchRow>
          <SwitchRow label="Daily review" description="Record the day and choose tomorrow's #1. Skipped once it's done." {...toggle('dailyReview')}>
            {time('dailyReviewTime', 'Daily review time')}
          </SwitchRow>
          <SwitchRow
            label="Weekly review"
            description={
              LAST_WEEK_REVIEW_DAYS.includes(prefs.weeklyReviewDay)
                ? "Reviews last week: wins, lessons and this week's focus."
                : "Reviews this week so far: wins, lessons and next week's focus."
            }
            {...toggle('weeklyReview')}
          >
            <Select
              aria-label="Weekly review day"
              value={String(prefs.weeklyReviewDay)}
              options={WEEKDAY_OPTIONS}
              onChange={(e) => save({ weeklyReviewDay: Number(e.target.value) })}
              className="w-24"
            />
            {time('weeklyReviewTime', 'Weekly review time')}
          </SwitchRow>
          <SwitchRow label="Habit reminders" description="An evening check for habits still open today." {...toggle('habitReminders')}>
            {time('habitReminderTime', 'Habit reminder time')}
          </SwitchRow>
          <SwitchRow label="Focus session end" description="When a focus session reaches its planned length." {...toggle('focusEnd')} />
        </Group>
        <Group title="Quiet hours">
          <SwitchRow label="Quiet hours" description="Push pauses, the in-app center still records." {...toggle('quietHours')}>
            {time('quietStart', 'Quiet hours start')}
            <span className="text-[13px] text-muted">to</span>
            {time('quietEnd', 'Quiet hours end')}
          </SwitchRow>
        </Group>
        <Group title="Business alerts" description="Off by default. Only the ones you switch on are sent.">
          <SwitchRow label="New paid order" description="Amount and product for every paid order." {...businessAlert('newOrder')} />
          <SwitchRow label="Refund" description="Partial and full refunds as they are recorded." {...businessAlert('refund')} />
          <SwitchRow
            label="Unusual conversion drop"
            description="At 09:00, when yesterday's conversion rate fell well below the previous week."
            {...businessAlert('conversionDrop')}
          />
          <SwitchRow
            label="Experiment purchase milestones"
            description={`When an experiment crosses ${MILESTONES} purchases.`}
            {...businessAlert('experimentMilestone')}
          />
          <SwitchRow label="Goal or revenue target reached" description="When a tracked goal hits its target." {...businessAlert('goalReached')} />
          <SwitchRow label="Daily revenue update" description="Revenue, purchases and ad spend for the day." {...businessAlert('dailyRevenue')}>
            <TimeInput
              value={prefs.business?.dailyRevenueTime}
              label="Daily revenue update time"
              onCommit={(value) => save({ business: { dailyRevenueTime: value } })}
            />
          </SwitchRow>
          <SwitchRow
            label="Ad spend above daily budget"
            description="When today's spend passes a product's daily budget."
            {...businessAlert('adSpendThreshold')}
          />
        </Group>
      </div>
    </div>
  );
}

export function NotificationSettings({ prefs, timezone }) {
  let content;
  if (prefs.isPending) {
    content = (
      <div className="mt-4 space-y-3" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    );
  } else if (!prefs.data) {
    content = <ErrorState error={prefs.error} onRetry={prefs.refetch} compact />;
  } else {
    content = <Preferences prefs={prefs.data} />;
  }

  return (
    <Card id="notifications" className="scroll-mt-20 p-5 lg:scroll-mt-6">
      <CardHeader
        title="Notifications"
        subtitle={`The same reminders and alerts on every device you enable. Times use ${timezone}.`}
        className="mb-4"
      />
      <EnableNotifications />
      {content}
    </Card>
  );
}
