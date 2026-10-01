import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { loginSchema } from '@product-lab/shared/schemas';
import { BrandMark } from '../../components/layout/AppShell.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { useForm } from '../../lib/form.js';
import { signIn } from '../../lib/session.js';

export default function LoginPage() {
  const queryClient = useQueryClient();
  const form = useForm({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const body = form.validate(loginSchema, form.values);
    if (!body) return;
    setLoading(true);
    try {
      queryClient.setQueryData(['me'], await signIn(body));
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <BrandMark className="size-9" />
          <span className="font-display text-[26px] font-semibold tracking-[-0.01em]">Product Lab</span>
        </div>
        <Card className="p-6">
          <h1 className="font-display text-[28px] leading-tight font-medium">Sign in</h1>
          <p className="mt-1 text-[13px] text-muted">Your private experimentation workspace.</p>
          <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4">
            <FormField form={form} name="email" label="Email" type="email" autoComplete="username" autoFocus />
            <FormField form={form} name="password" label="Password" type="password" autoComplete="current-password" />
            {error && (
              <p className="text-[13px] text-negative" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" loading={loading} className="w-full justify-center">
              Sign in
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
