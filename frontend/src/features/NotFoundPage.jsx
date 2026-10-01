import { Compass } from 'lucide-react';
import { ButtonLink } from '../components/ui/Button.jsx';
import { EmptyState } from '../components/ui/States.jsx';

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="This page does not exist or was moved."
      action={<ButtonLink to="/">Back to overview</ButtonLink>}
    />
  );
}
