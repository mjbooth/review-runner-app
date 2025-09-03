import type { ContextMenuItem, CustomerWithScheduled } from '../types/customer';

export function getDaysSince(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function getContextMenuItems(customer: CustomerWithScheduled): ContextMenuItem[] {
  const baseItems: ContextMenuItem[] = [
    {
      id: 'edit-details',
      label: 'Edit details',
      icon: 'Edit',
      action: 'edit-details',
      enabled: !customer.suppressed,
      visible: true,
      separator: true,
    },
  ];

  // Dynamic items based on customer state
  const dynamicItems: ContextMenuItem[] = [];

  // Send/Schedule actions
  if (customer.hasScheduledRequest) {
    dynamicItems.push(
      {
        id: 'send-now',
        label: 'Send now',
        icon: 'Send',
        action: 'send-immediate',
        enabled: true,
        visible: true,
      },
      {
        id: 'edit-scheduled',
        label: 'Edit scheduled send',
        icon: 'Calendar',
        action: 'edit-schedule',
        enabled: true,
        visible: true,
      },
      {
        id: 'view-details',
        label: 'View send details',
        icon: 'Eye',
        action: 'view-schedule-details',
        enabled: true,
        visible: true,
        separator: true,
      }
    );
  } else if (!customer.suppressed) {
    const daysSinceLastRequest = customer.lastRequest ? getDaysSince(customer.lastRequest) : null;
    const canSendNow =
      !customer.lastRequest || daysSinceLastRequest === null || daysSinceLastRequest >= 7;

    dynamicItems.push(
      {
        id: 'send-now',
        label: 'Send now',
        icon: 'Send',
        action: 'send-immediate',
        enabled: canSendNow,
        visible: true,
      },
      {
        id: 'schedule-send',
        label: 'Schedule send',
        icon: 'Calendar',
        action: 'schedule-new',
        enabled: true,
        visible: true,
        separator: true,
      }
    );
  }

  // Message actions
  if (customer.lastRequest || customer.hasScheduledRequest) {
    dynamicItems.push(
      {
        id: 'view-message',
        label: 'View message',
        icon: 'MessageSquare',
        action: 'view-message',
        enabled: true,
        visible: true,
      },
      {
        id: 'edit-message',
        label: 'Edit message',
        icon: 'Edit2',
        action: 'edit-message',
        enabled: !customer.suppressed,
        visible: true,
        separator: true,
      }
    );
  }

  // History action
  dynamicItems.push({
    id: 'view-history',
    label: 'View history',
    icon: 'History',
    action: 'view-history',
    enabled: true,
    visible: true,
    separator: true,
  });

  // Archive action
  const archiveItems: ContextMenuItem[] = [
    {
      id: 'archive',
      label: customer.suppressed ? 'Unarchive customer' : 'Archive customer',
      icon: customer.suppressed ? 'ArchiveRestore' : 'Archive',
      action: customer.suppressed ? 'unarchive' : 'archive',
      enabled: true,
      visible: true,
    },
  ];

  return [...baseItems, ...dynamicItems, ...archiveItems];
}

export function getRowClassName(
  customer: CustomerWithScheduled,
  isSelected: boolean = false
): string {
  let classes =
    'border-b border-[rgba(79,77,74,0.29)] transition-colors duration-150 cursor-pointer select-none';

  if (customer.hasScheduledRequest) {
    // Use design token colors for scheduled state
    classes += ' bg-[var(--color-scheduled-bg)] hover:bg-[var(--color-scheduled-hover)]';
  } else {
    classes += ' bg-white hover:bg-gray-50';
  }

  if (isSelected) {
    // Adjust selection styling for scheduled rows
    if (customer.hasScheduledRequest) {
      classes += ' ring-2 ring-blue-500 ring-inset bg-[var(--color-scheduled-hover)]';
    } else {
      classes += ' ring-2 ring-blue-500 ring-inset bg-blue-50';
    }
  }

  return classes;
}
