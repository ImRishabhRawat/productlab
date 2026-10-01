import { useQueryClient } from '@tanstack/react-query';
import { LogOut, Sparkles } from 'lucide-react';
import { settingsSchema } from '@product-lab/shared/schemas';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { configureFormat } from '../../lib/format.js';
import { numberOrUndefined, useForm } from '../../lib/form.js';
import { useGet, useMutate } from '../../lib/queries.js';
import { useSession, useSettings, useSignOut } from '../../lib/session.js';
import { AppCard, DevicesCard } from './DeviceSettings.jsx';
import { NotificationSettings } from './NotificationSettings.jsx';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'];
const LOCALES = [
  { value: 'en-IN', label: 'English (India) · 1,00,000' },
  { value: 'en-US', label: 'English (US) · 100,000' },
  { value: 'en-GB', label: 'English (UK) · 100,000' },
];
const TIMEZONES = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['Asia/Kolkata', 'UTC'];
const NUMBER_KEYS = ['defaultPaymentFeePct', 'defaultRefundRatePct', 'defaultVariableCostPerSale', 'defaultDesiredMarginPct'];
const SECTIONS = [
  ['workspace', 'Workspace'],
  ['notifications', 'Notifications'],
  ['devices', 'Devices'],
  ['app', 'App'],
  ['account', 'Account'],
];
const SECTION_CLASS = 'scroll-mt-20 p-5 lg:scroll-mt-6';
const BROWSER_ZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
})();

function resolvedZone(zone) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return zone;
  }
}

function timezoneOptions(saved) {
  if (!saved || TIMEZONES.includes(saved)) return TIMEZONES;
  const alias = resolvedZone(saved);
  return [...TIMEZONES.filter((zone) => zone !== alias), saved].sort();
}

function SettingsForm({ settings }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useForm(() => ({
    currency: settings.currency,
    locale: settings.locale,
    timezone: settings.timezone,
    ...Object.fromEntries(NUMBER_KEYS.map((k) => [k, String(settings[k] ?? '')])),
  }));
  const save = useMutate((body) => api('/settings', { method: 'PATCH', body }));
  const zoneDiffers = BROWSER_ZONE && resolvedZone(BROWSER_ZONE) !== resolvedZone(settings.timezone);

  async function persist(body, message) {
    const saved = await save.mutateAsync(body);
    configureFormat({ currency: saved.currency, locale: saved.locale, timezone: saved.timezone });
    queryClient.setQueryData(['settings'], saved);
    toast.success(message);
  }

  const adoptBrowserZone = () => persist({ timezone: BROWSER_ZONE }, `Timezone set to ${BROWSER_ZONE}`).catch((err) => toast.error(err));

  async function onSubmit(e) {
    e.preventDefault();
    const body = form.validate(settingsSchema, {
      currency: form.values.currency,
      locale: form.values.locale,
      timezone: form.values.timezone,
      ...Object.fromEntries(NUMBER_KEYS.map((k) => [k, numberOrUndefined(form.values[k])])),
    });
    if (!body) return;
    try {
      await persist(body, 'Settings saved');
    } catch (err) {
      form.serverErrors(err);
      toast.error(err);
    }
  }

  return (
    <Card id="workspace" className={SECTION_CLASS}>
      <CardHeader title="Workspace" subtitle="Formatting, timezone and default cost assumptions for new products" className="mb-5" />
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField form={form} name="currency" label="Currency" as="select" options={CURRENCIES} />
          <FormField form={form} name="locale" label="Number format" as="select" options={LOCALES} />
          <FormField
            form={form}
            name="timezone"
            label="Timezone"
            as="select"
            options={timezoneOptions(settings.timezone)}
            hint={
              zoneDiffers ? (
                <span className="flex flex-wrap items-center gap-x-2">
                  This device is on {BROWSER_ZONE}; schedules and reminders use the saved zone.
                  <button
                    type="button"
                    onClick={adoptBrowserZone}
                    disabled={save.isPending}
                    className="min-h-7 font-medium text-primary-hover hover:underline disabled:opacity-50 max-md:min-h-10"
                  >
                    Use {BROWSER_ZONE}
                  </button>
                </span>
              ) : (
                'Used for “today”, schedules, reminders and daily order buckets'
              )
            }
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField form={form} name="defaultPaymentFeePct" label="Payment fee" type="number" min="0" max="100" step="0.01" suffix="%" />
          <FormField form={form} name="defaultRefundRatePct" label="Expected refunds" type="number" min="0" max="100" step="0.1" suffix="%" />
          <FormField form={form} name="defaultVariableCostPerSale" label="Other cost per sale" type="number" min="0" step="0.01" />
          <FormField form={form} name="defaultDesiredMarginPct" label="Desired margin" type="number" min="0" max="100" step="1" suffix="%" />
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={save.isPending}>
            Save settings
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function SettingsPage() {
  const settings = useSettings();
  const session = useSession();
  const signOut = useSignOut();
  const prefs = useGet('/notification-preferences');
  const devices = useGet('/push/devices');
  const ai = settings.data?.ai;

  return (
    <>
      <PageHeader title="Settings" />
      <nav aria-label="Settings sections" className="mb-4 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
        {SECTIONS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="inline-flex h-10 shrink-0 items-center rounded-full border border-hairline bg-canvas px-3.5 text-[13px] font-medium text-body hover:bg-tint focus-visible:-outline-offset-2"
          >
            {label}
          </a>
        ))}
      </nav>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {settings.data && <SettingsForm settings={settings.data} />}
          <NotificationSettings prefs={prefs} timezone={settings.data?.timezone} />
        </div>
        <div className="space-y-4">
          <DevicesCard devices={devices} />
          <AppCard />
          <Card className="p-5">
            <CardHeader title="AI analysis" className="mb-3" actions={<Sparkles className="size-4 text-accent" aria-hidden />} />
            <StatusBadge kind="experimentStatus" value={ai?.enabled ? 'completed' : 'planned'} label={ai?.enabled ? 'Connected' : 'Not configured'} />
            <p className="mt-3 text-[13px] text-muted">
              {ai?.enabled ? (
                <>
                  Using <span className="font-medium text-ink">{ai.model}</span>. The key stays on the server.
                </>
              ) : (
                <>
                  Set <code className="rounded bg-tint px-1 text-xs text-ink">GEMINI_API_KEY</code> in the server environment to enable it. Everything else works without it.
                </>
              )}
            </p>
          </Card>
          <Card id="account" className={SECTION_CLASS}>
            <CardHeader title="Account" className="mb-3" />
            <p className="text-[13px] text-body">{session.data?.email}</p>
            <p className="mt-1 text-xs text-muted">Credentials are set with ADMIN_EMAIL and ADMIN_PASSWORD on the server.</p>
            <Button size="sm" icon={LogOut} className="mt-4" onClick={signOut}>
              Sign out
            </Button>
          </Card>
        </div>
      </div>
    </>
  );
}
