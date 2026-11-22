import { PageShell } from '@/shared/layout/page-shell';
import { InviteAdminForm } from './_components/invite-admin-form';

export default function AdminHome() {
  return (
    <PageShell title="Admin" description="Approvals, masters and reports will appear here.">
      <InviteAdminForm />
    </PageShell>
  );
}
