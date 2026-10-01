import { useState } from 'react';
import { BellOff, BellRing, CalendarClock, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { Legend } from '../../components/charts/Legend.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { PageHeader, Section } from '../../components/ui/PageHeader.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { useDateRange } from '../../lib/dateRange.jsx';
import { plural } from '../../lib/format.js';
import { useGet, useList, useRemove, useUpdate } from '../../lib/queries.js';
import { useSettings } from '../../lib/session.js';
import { BlockList } from './BlockList.jsx';
import { HabitsSection } from './HabitsSection.jsx';
import { categoryLegend, planWeek, remindersOff } from './schedule.js';
import { TimeBlockFormModal } from './TimeBlockFormModal.jsx';
import { DayView, WeekView, weekTable } from './WeekView.jsx';

const LIST = new Intl.ListFormat('en', { type: 'conjunction' });

function ReminderNote({ prefs, off }) {
  const Icon = off.length ? BellOff : BellRing;
  const settings = (
    <Link
      to="/settings#notifications"
      className="relative inline-block font-medium text-ink hover:underline max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-3"
    >
      Notification settings
    </Link>
  );
  const subject = prefs?.enabled ? `${LIST.format(off.map((r) => `“${r.name}”`))} ${off.length > 1 ? 'are' : 'is'}` : 'All notifications are';
  return (
    <p className="mt-3 flex items-start gap-2 text-[13px] text-muted">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      {off.length ? (
        <span>
          {subject} off in {settings}. Reminders marked “off in settings” are not sent.
        </span>
      ) : (
        <span>Block reminders also follow the global switches and quiet hours in {settings}.</span>
      )}
    </p>
  );
}

export default function PlanPage() {
  const { today } = useDateRange();
  const timezone = useSettings().data?.timezone;
  const toast = useToast();
  const blocks = useList('time-blocks');
  const goals = useList('goals');
  const products = useList('products', { sort: 'name' });
  const prefs = useGet('/notification-preferences');
  const silenced = remindersOff(prefs.data);
  const toggle = useUpdate('time-blocks');
  const remove = useRemove('time-blocks');
  const [dialog, setDialog] = useState(null);

  const items = blocks.data?.items ?? [];
  const enabled = items.filter((b) => b.enabled);
  const days = planWeek(enabled);
  const off = items.length - enabled.length;
  const empty = blocks.isSuccess && !items.length;
  const toggling = toggle.variables && (toggle.isPending || blocks.isFetching) ? toggle.variables : null;
  const close = () => setDialog(null);
  const add = (preset) => setDialog({ kind: 'block', days: preset });
  const edit = (block) => setDialog({ kind: 'block', block });

  async function setEnabled(block, value) {
    try {
      await toggle.mutateAsync({ id: block._id, enabled: value });
      toast.success(`${block.name} switched ${value ? 'on' : 'off'}`);
    } catch (err) {
      toast.error(err);
    }
  }

  async function confirmDelete() {
    try {
      await remove.mutateAsync(dialog.block._id);
      toast.success('Block deleted');
    } catch (err) {
      toast.error(err);
    }
    close();
  }

  return (
    <>
      <PageHeader
        title="Plan"
        description={`Your repeating week · times in ${timezone}`}
        actions={
          !empty && (
            <Button variant="primary" icon={Plus} onClick={() => add()}>
              Add block
            </Button>
          )
        }
      />

      {blocks.error ? (
        <Card>
          <ErrorState error={blocks.error} onRetry={blocks.refetch} />
        </Card>
      ) : empty ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title="Build your day"
            description={
              <>
                Add your first block (for example <span className="whitespace-nowrap">Money Block 10:00–12:30</span>).
              </>
            }
            action={
              <Button variant="primary" icon={Plus} onClick={() => add()}>
                Add block
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <ChartCard
            title="Schedule"
            subtitle="Enabled blocks by day. Select a block to edit it."
            height={null}
            loading={blocks.isPending}
            fetching={blocks.isFetching}
            empty={!enabled.length}
            emptyMessage="Every block is switched off. Turn one on below."
            table={weekTable(days)}
            toolbar={
              enabled.length > 0 && (
                <div className="hidden md:block">
                  <Legend items={categoryLegend(enabled)} />
                </div>
              )
            }
          >
            <div className="hidden md:block">
              <WeekView days={days} today={today} onEdit={edit} />
            </div>
            <div className="md:hidden">
              <DayView days={days} today={today} onEdit={edit} onAdd={add} />
            </div>
          </ChartCard>

          <Section
            title="All blocks"
            description={blocks.isSuccess ? `${plural(items.length, 'block')}${off ? ` · ${off} switched off` : ''}` : null}
          >
            {blocks.isPending ? (
              <Skeleton className="h-40" />
            ) : (
              <BlockList
                blocks={items}
                goals={goals.data?.items ?? []}
                products={products.data?.items ?? []}
                off={silenced}
                toggling={toggling}
                onToggle={setEnabled}
                onEdit={edit}
                onDelete={(block) => setDialog({ kind: 'delete', block })}
              />
            )}
            <ReminderNote prefs={prefs.data} off={silenced} />
          </Section>
        </>
      )}

      <HabitsSection />

      <TimeBlockFormModal open={dialog?.kind === 'block'} block={dialog?.block} days={dialog?.days} blocks={items} onClose={close} />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onClose={close}
        onConfirm={confirmDelete}
        loading={remove.isPending}
        title="Delete block?"
        message={`“${dialog?.block?.name}” is removed from today onward and its reminders stop. Past days keep it in your history. Switch it off instead to pause it.`}
        confirmLabel="Delete block"
      />
    </>
  );
}
