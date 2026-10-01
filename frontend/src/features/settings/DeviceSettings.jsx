import { useState } from 'react';
import { CircleAlert, CircleCheck, CloudOff, Download, Laptop, Send, Smartphone, Tablet, Trash2 } from 'lucide-react';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { fmtDateTime, fmtNumber, fmtRelative, plural } from '../../lib/format.js';
import { usePush } from '../../lib/push.js';
import { useInstall } from '../../lib/pwa.js';
import { useMutate } from '../../lib/queries.js';
import { HomeScreenSteps, usePushKeyError } from '../notifications/EnableNotifications.jsx';

const INSTALL_STEPS = [
  ['Android · Chrome', 'open the ⋮ menu → Install app'],
  ['Computer · Chrome or Edge', 'click the install icon in the address bar'],
  ['Mac · Safari', 'File → Add to Dock'],
];

function deviceIcon({ label = '', userAgent = '' }) {
  const text = `${label} ${userAgent}`;
  if (/iPad|Tablet/.test(text)) return Tablet;
  if (/iPhone|Android|Mobile/.test(text)) return Smartphone;
  return Laptop;
}

function testResult({ sent, failed, skipped }) {
  if (skipped === 'not_configured') return [false, 'Push is not configured on the server. The test is in the in-app center only.'];
  if (skipped === 'no_devices') return [false, 'No devices to send to yet. Enable notifications on this device first.'];
  if (skipped === 'quiet_hours') return [false, 'Quiet hours are on, so push paused. The test is in the in-app center.'];
  if (skipped === 'disabled') return [false, 'Notifications are switched off.'];
  if (!sent) return [false, `Delivery failed on ${plural(failed, 'device')}.`];
  return [!failed, `Sent to ${plural(sent, 'device')}${failed ? `, failed on ${fmtNumber(failed)}` : ''}.`];
}

function When({ at }) {
  return (
    <time dateTime={at} title={fmtDateTime(at)}>
      {fmtRelative(at)}
    </time>
  );
}

function TestNotification() {
  const test = useMutate(() => api('/push/test', { method: 'POST' }));
  const [ok, message] = test.isSuccess ? testResult(test.data.pushed) : [false, test.error?.message];
  const Icon = ok ? CircleCheck : CircleAlert;
  return (
    <div className="mt-4 space-y-2 border-t border-hairline pt-4">
      <Button icon={Send} loading={test.isPending} onClick={() => test.mutate()}>
        Send test notification
      </Button>
      <p role="status" className="text-[13px] text-body">
        {message && !test.isPending && (
          <span className="flex items-start gap-2">
            <Icon className={`mt-0.5 size-4 shrink-0 ${ok ? 'text-positive' : 'text-warning'}`} aria-hidden />
            {message}
          </span>
        )}
      </p>
    </div>
  );
}

export function DevicesCard({ devices }) {
  const push = usePush();
  const [keyError, retrying] = usePushKeyError(push);
  const toast = useToast();
  const [removing, setRemoving] = useState(null);
  const remove = useMutate((id) => api(`/push/devices/${id}`, { method: 'DELETE' }));
  const items = devices.data?.items ?? [];
  const removingThis = Boolean(removing && push.endpoint && removing.endpoint === push.endpoint);

  async function confirmRemove() {
    try {
      await remove.mutateAsync(removing._id);
      if (removingThis) await push.disable();
      toast.success(`${removing.label || 'Device'} removed`);
      setRemoving(null);
    } catch (err) {
      toast.error(err);
    }
  }

  let content;
  if (devices.isPending) content = <Skeleton className="h-24" />;
  else if (!devices.data) content = <ErrorState error={devices.error} onRetry={devices.refetch} compact />;
  else if (!items.length) {
    content = (
      <EmptyState
        compact
        icon={Smartphone}
        title="No devices yet."
        description={
          keyError ? 'Couldn’t check push notifications on the server.' : 'Enable notifications on each phone or computer you use.'
        }
        action={
          keyError ? (
            <Button size="sm" loading={retrying} onClick={push.retry}>
              Try again
            </Button>
          ) : (
            push.status === 'off' && (
              <Button size="sm" onClick={push.enable} loading={push.busy}>
                Enable on this device
              </Button>
            )
          )
        }
      />
    );
  } else {
    content = (
      <ul className="divide-y divide-hairline-soft">
        {items.map((d) => {
          const Icon = deviceIcon(d);
          return (
            <li key={d._id} className="flex items-start gap-3 py-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-tint text-body" aria-hidden>
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 truncate text-[13.5px] font-medium text-ink">{d.label || 'Browser'}</span>
                  {push.endpoint === d.endpoint && <Badge>This device</Badge>}
                  <StatusBadge kind="experimentStatus" value={d.active ? 'completed' : 'planned'} label={d.active ? 'Active' : 'Inactive'} />
                </p>
                <p className="mt-1 text-xs text-muted">
                  Last seen <When at={d.lastSeenAt} /> ·{' '}
                  {d.lastSuccessAt ? (
                    <>
                      last delivered <When at={d.lastSuccessAt} />
                    </>
                  ) : (
                    'nothing delivered yet'
                  )}
                  {d.active && d.failures > 0 && ` · ${plural(d.failures, 'failed delivery', 'failed deliveries')}`}
                </p>
                {!d.active && <p className="mt-0.5 text-xs text-warning">Push stopped reaching it. Enable notifications on it again.</p>}
              </div>
              <IconButton
                icon={Trash2}
                label={`Remove ${d.label || 'device'}`}
                onClick={() => setRemoving(d)}
                className="-my-1 -mr-2"
              />
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Card id="devices" className="scroll-mt-20 p-5 lg:scroll-mt-6">
      <CardHeader title="Devices" subtitle="Each browser or phone with notifications on. Several are normal." className="mb-2" />
      {content}
      <TestNotification />
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        title="Remove this device?"
        message={
          removingThis
            ? 'This device stops getting push notifications until you enable them here again.'
            : `${removing?.label || 'That device'} stops getting push notifications and stays removed until you enable them on it again.`
        }
        confirmLabel="Remove"
        loading={remove.isPending || push.busy}
      />
    </Card>
  );
}

export function AppCard() {
  const toast = useToast();
  const { standalone, ios, canPrompt, install } = useInstall();

  async function installApp() {
    if ((await install()) === 'accepted') toast.success('Product Lab installed');
  }

  let state;
  if (standalone) {
    state = (
      <p className="flex items-center gap-2 text-[13px] text-body">
        <CircleCheck className="size-4 shrink-0 text-positive" aria-hidden />
        Installed. You are using the Product Lab app.
      </p>
    );
  } else if (canPrompt) {
    state = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-body">Open it in its own window with a Home Screen or dock icon.</p>
        <Button variant="primary" icon={Download} onClick={installApp}>
          Install app
        </Button>
      </div>
    );
  } else if (ios) {
    state = <HomeScreenSteps />;
  } else {
    state = (
      <ul className="space-y-1.5 text-[13px] text-body">
        {INSTALL_STEPS.map(([where, how]) => (
          <li key={where}>
            <span className="font-medium text-ink">{where}:</span> {how}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card id="app" className="scroll-mt-20 p-5 lg:scroll-mt-6">
      <CardHeader title="App" subtitle={standalone ? null : 'Install Product Lab on your phone and computer'} className="mb-3" />
      {state}
      <p className="mt-4 flex gap-2 border-t border-hairline pt-3 text-xs text-muted">
        <CloudOff className="mt-px size-3.5 shrink-0" aria-hidden />
        The app shell and your last-loaded Today, goals and schedule open offline. Habit check-ins, your #1 outcome, daily reviews and
        notifications marked read while offline are kept on this device and sync when you reconnect; other changes need a connection.
      </p>
    </Card>
  );
}
