import { type Metadata } from 'next';
import ScheduledEmailsTable from '@/components/dashboard/scheduled-emails/ScheduledEmailsTable';

export const metadata: Metadata = {
  title: 'Scheduled Emails | Review Runner',
  description: 'View and manage your scheduled email campaigns',
};

export default function ScheduledEmailsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <ScheduledEmailsTable />
    </div>
  );
}
