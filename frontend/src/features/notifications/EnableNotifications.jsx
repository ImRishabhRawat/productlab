import { useState } from 'react';
import { BellOff, BellRing, Share, SquarePlus, X } from 'lucide-react';
import { Button, ButtonLink, IconButton } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { usePush, usePushKey } from '../../lib/push.js';

const DISMISS_KEY = 'product-lab.push-prompt-dismissed';
const USES = ['Time-block reminders', "Today's #1 outcome", 'Focus session end', 'Daily and weekly review', 'Business alerts you switch on'];

const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

const MESSAGES = {
  unsupported: 'This browser can’t receive push notifications. You’ll still see everything in the in-app notification center.',
  unconfigured: 'Push is not configured on the server yet (VAPID keys are missing). In-app notifications still work.',
  denied: 'Notifications are blocked for this site. Allow them in your browser’s site settings, then reload Product Lab.',
};

export function HomeScreenSteps() {
  return (
    <ol className="space-y-1.5 text-[13px] text-body">
      <li className="flex gap-2">
        <span className="font-medium text-ink">1.</span>
        <span>
          Open Product Lab in Safari and tap <Share className="inline size-4 align-text-bottom text-ink" role="img" aria-label="Share" />
        </span>
      </li>
      <li className="flex gap-2">
        <span className="font-medium text-ink">2.</span>
        <span>
          Choose <span className="font-medium text-ink">Add to Home Screen</span>{' '}
          <SquarePlus className="inline size-4 align-text-bottom text-ink" aria-hidden />
        </span>
      </li>
      <li className="flex gap-2">
        <span className="font-medium text-ink">3.</span>
        <span>Open it from the Home Screen and enable notifications there</span>
      </li>
    </ol>
  );
}

export function usePushKeyError(push) {
  const key = usePushKey();
  const retrying = push.status === 'loading' && !key.data && key.isFetching && key.errorUpdatedAt > 0;
  return [push.status === 'error' || retrying, retrying];
}

export function EnableNotifications({ compact = false }) {
  const push = usePush();
  const [keyError, retrying] = usePushKeyError(push);
  const [dismissed, setDismissed] = useState(readDismissed);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage unavailable */
    }
  };

  if (compact && (dismissed || !['off', 'install'].includes(push.status))) return null;

  if (keyError) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">Couldn’t check push notifications on the server. In-app notifications still work.</p>
        <Button size="sm" loading={retrying} onClick={push.retry}>
          Try again
        </Button>
      </div>
    );
  }

  if (push.status === 'loading') return null;

  if (push.status === 'on') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[13px] text-body">
          <BellRing className="size-4 text-positive" aria-hidden />
          Notifications are on for this device.
        </p>
        <Button size="sm" icon={BellOff} loading={push.busy} onClick={push.disable}>
          Turn off on this device
        </Button>
      </div>
    );
  }

  if (MESSAGES[push.status]) return <p className="text-[13px] text-muted">{MESSAGES[push.status]}</p>;

  const Title = compact ? 'h2' : 'h3';
  return (
    <Card className={`relative p-4 ${compact ? 'bg-tint/50' : ''}`}>
      {compact && (
        <IconButton icon={X} label="Dismiss" size="icon-sm" className="absolute top-2 right-2" onClick={dismiss} />
      )}
      <div className={`flex items-start gap-3 ${compact ? 'pr-6' : ''}`}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <BellRing className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <Title className="text-[15px] font-medium text-ink">Enable Product Lab notifications</Title>
          <p className="mt-0.5 text-[13px] text-muted">
            Only the reminders and alerts switched on {compact ? 'in Settings' : 'below'}, sent by the server even when the app is closed.
          </p>
          {!compact && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {USES.map((u) => (
                <li key={u} className="rounded-full bg-tint px-2.5 py-0.5 text-xs text-body">
                  {u}
                </li>
              ))}
            </ul>
          )}
          {push.status === 'install' ? (
            <div className="mt-3">
              <p className="mb-2 text-[13px] text-body">On iPhone and iPad, notifications work once Product Lab is on your Home Screen:</p>
              <HomeScreenSteps />
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" icon={BellRing} loading={push.busy} onClick={push.enable}>
                Enable notifications
              </Button>
              {compact && (
                <ButtonLink to="/settings#notifications" size="sm">
                  Choose notifications
                </ButtonLink>
              )}
            </div>
          )}
          {push.error && (
            <p role="alert" className="mt-2 text-[13px] text-negative">
              {push.error}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
