import type { Metadata } from 'next';
import AdminConsole from '@/components/AdminConsole';

// Owner only; not linked from the public UI and never indexed.
export const metadata: Metadata = { title: 'Lockabox · Admin', robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminConsole />;
}
