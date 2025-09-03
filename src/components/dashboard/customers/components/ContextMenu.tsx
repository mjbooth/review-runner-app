'use client';

import React from 'react';
import { type Customer } from '../types';

interface ContextMenuProps {
  isVisible: boolean;
  x: number;
  y: number;
  customer: Customer | null;
  onClose: () => void;
  onAction: (action: string, customer: Customer) => void;
}

interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  separator?: boolean;
  destructive?: boolean;
  primary?: boolean;
}

type CustomerStatus =
  | 'Draft'
  | 'Ready'
  | 'Scheduled'
  | 'Review Sent'
  | 'Review Clicked'
  | 'Review Failed'
  | 'Follow-up Sent'
  | 'Follow-up Clicked'
  | 'Follow-up Failed';

// Status-based action definitions according to spec
const statusActions: Record<CustomerStatus, { primary: string[]; secondary: string[] }> = {
  Draft: {
    primary: ['complete-info', 'delete-customer'],
    secondary: ['add-notes', 'view-details'],
  },
  Ready: {
    primary: ['send-review', 'edit-customer'],
    secondary: ['schedule-review', 'add-suppression', 'add-notes', 'delete-customer'],
  },
  Scheduled: {
    primary: ['cancel-request', 'send-now', 'reschedule'],
    secondary: ['edit-customer', 'edit-message', 'view-request-details'],
  },
  'Review Sent': {
    primary: ['send-followup', 'resend-review', 'mark-completed'],
    secondary: ['edit-customer', 'view-analytics', 'add-notes'],
  },
  'Review Clicked': {
    primary: ['send-followup', 'mark-completed', 'send-new-campaign'],
    secondary: ['view-analytics', 'add-notes', 'schedule-followup'],
  },
  'Review Failed': {
    primary: ['fix-contact-info', 'retry-send', 'switch-channel'],
    secondary: ['view-error-details', 'add-suppression', 'add-notes'],
  },
  'Follow-up Sent': {
    primary: ['resend-followup', 'mark-completed', 'send-new-campaign'],
    secondary: ['view-analytics', 'add-notes', 'schedule-another-followup'],
  },
  'Follow-up Clicked': {
    primary: ['mark-completed', 'send-new-campaign', 'add-vip'],
    secondary: ['view-full-analytics', 'add-notes', 'reset-future'],
  },
  'Follow-up Failed': {
    primary: ['fix-contact-info', 'retry-followup', 'switch-channel'],
    secondary: ['view-error-details', 'mark-completed', 'add-suppression'],
  },
};

// Universal actions available on all statuses (avoiding duplicates with status-specific actions)
const universalActions = ['view-history'];

// All possible action definitions with icons
const actionDefinitions: Record<string, ContextMenuItem> = {
  'view-details': {
    id: 'view-details',
    label: 'View Details',
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  'complete-info': {
    id: 'complete-info',
    label: 'Complete Customer Info',
    primary: true,
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    ),
  },
  'send-review': {
    id: 'send-review',
    label: 'Send Review Request',
    primary: true,
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </svg>
    ),
  },
  'edit-customer': {
    id: 'edit-customer',
    label: 'Edit Customer',
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    ),
  },
  'cancel-request': {
    id: 'cancel-request',
    label: 'Cancel Request',
    primary: true,
    destructive: true,
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="m4.9 4.9 14.2 14.2" />
      </svg>
    ),
  },
  'send-now': {
    id: 'send-now',
    label: 'Send Now',
    primary: true,
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12,6 12,12 16,14" />
      </svg>
    ),
  },
  'send-followup': {
    id: 'send-followup',
    label: 'Send Follow-up',
    primary: true,
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </svg>
    ),
  },
  'mark-completed': {
    id: 'mark-completed',
    label: 'Mark as Completed',
    primary: true,
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polyline points="20,6 9,17 4,12" />
      </svg>
    ),
  },
  'fix-contact-info': {
    id: 'fix-contact-info',
    label: 'Fix Contact Info',
    primary: true,
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    ),
  },
  'view-analytics': {
    id: 'view-analytics',
    label: 'View Analytics',
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </svg>
    ),
  },
  'add-notes': {
    id: 'add-notes',
    label: 'Add Notes',
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14,2 14,8 20,8" />
      </svg>
    ),
  },
  'add-suppression': {
    id: 'add-suppression',
    label: 'Add to Suppression List',
    destructive: true,
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="m4.9 4.9 14.2 14.2" />
      </svg>
    ),
  },
  'delete-customer': {
    id: 'delete-customer',
    label: 'Delete Customer',
    destructive: true,
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M3 6h18" />
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      </svg>
    ),
  },
  'view-history': {
    id: 'view-history',
    label: 'View Customer History',
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M12 7v5l4 2" />
      </svg>
    ),
  },
  'schedule-review': {
    id: 'schedule-review',
    label: 'Schedule Review Request',
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  reschedule: {
    id: 'reschedule',
    label: 'Reschedule',
    primary: true,
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  'edit-message': {
    id: 'edit-message',
    label: 'Edit Message',
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    ),
  },
  'view-request-details': {
    id: 'view-request-details',
    label: 'View Request Details',
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14,2 14,8 20,8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10,9 9,9 8,9" />
      </svg>
    ),
  },
  'resend-review': {
    id: 'resend-review',
    label: 'Resend Review',
    primary: true,
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </svg>
    ),
  },
  'send-new-campaign': {
    id: 'send-new-campaign',
    label: 'Send New Campaign',
    primary: true,
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </svg>
    ),
  },
  'schedule-followup': {
    id: 'schedule-followup',
    label: 'Schedule Follow-up',
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  'retry-send': {
    id: 'retry-send',
    label: 'Retry Send',
    primary: true,
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
      </svg>
    ),
  },
  'switch-channel': {
    id: 'switch-channel',
    label: 'Switch Channel',
    primary: true,
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M7 7h10v10" />
        <path d="M7 17 17 7" />
      </svg>
    ),
  },
  'view-error-details': {
    id: 'view-error-details',
    label: 'View Error Details',
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
  'resend-followup': {
    id: 'resend-followup',
    label: 'Resend Follow-up',
    primary: true,
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </svg>
    ),
  },
  'schedule-another-followup': {
    id: 'schedule-another-followup',
    label: 'Schedule Another Follow-up',
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <path d="m9 16 2 2 4-4" />
      </svg>
    ),
  },
  'add-vip': {
    id: 'add-vip',
    label: 'Add to VIP List',
    primary: true,
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
      </svg>
    ),
  },
  'view-full-analytics': {
    id: 'view-full-analytics',
    label: 'View Full Analytics',
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </svg>
    ),
  },
  'reset-future': {
    id: 'reset-future',
    label: 'Reset for Future',
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
      </svg>
    ),
  },
  'retry-followup': {
    id: 'retry-followup',
    label: 'Retry Follow-up',
    primary: true,
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
      </svg>
    ),
  },
};

function getMenuItemsForStatus(status: CustomerStatus): ContextMenuItem[] {
  const actions = statusActions[status];
  if (!actions) {
    // Fallback for unknown status - show basic actions
    return [
      { ...actionDefinitions['view-details'], primary: false },
      { ...actionDefinitions['edit-customer'], primary: false },
      { id: 'separator-1', label: '', separator: true },
      { ...actionDefinitions['view-history'], primary: false },
    ];
  }

  const menuItems: ContextMenuItem[] = [];
  const addedActionIds = new Set<string>(); // Track added actions to avoid duplicates

  // Add primary actions
  actions.primary.forEach(actionId => {
    const action = actionDefinitions[actionId];
    if (action && !addedActionIds.has(actionId)) {
      menuItems.push({ ...action, primary: true });
      addedActionIds.add(actionId);
    }
  });

  // Add separator if we have both primary and secondary actions
  if (actions.primary.length > 0 && actions.secondary.length > 0) {
    menuItems.push({ id: 'separator-1', label: '', separator: true });
  }

  // Add secondary actions
  actions.secondary.forEach(actionId => {
    const action = actionDefinitions[actionId];
    if (action && !addedActionIds.has(actionId)) {
      menuItems.push({ ...action, primary: false });
      addedActionIds.add(actionId);
    }
  });

  // Add separator before universal actions
  if (menuItems.length > 0) {
    menuItems.push({ id: 'separator-2', label: '', separator: true });
  }

  // Add universal actions (avoiding duplicates)
  universalActions.forEach(actionId => {
    const action = actionDefinitions[actionId];
    if (action && !addedActionIds.has(actionId)) {
      menuItems.push({ ...action, primary: false });
      addedActionIds.add(actionId);
    }
  });

  return menuItems;
}

export function ContextMenu({ isVisible, x, y, customer, onClose, onAction }: ContextMenuProps) {
  if (!isVisible || !customer) return null;

  // Get status-specific menu items
  const menuItems = getMenuItemsForStatus(customer.status as CustomerStatus);

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.separator || item.disabled) return;
    onAction(item.id, customer);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Calculate positioning: top-left of cursor, or bottom-left if no space below
  const getMenuPosition = () => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // More accurate menu dimension estimates
    const menuWidth = 240; // min-w-56 = 224px + padding
    const headerHeight = 65; // Customer info header with status (reduced from 80)
    const itemHeight = 36; // Each menu item px-3 py-2 (reduced from 40)
    const separatorHeight = 5; // Separators my-1 border-t (reduced from 9)
    const containerPadding = 8; // py-1 on container

    const separatorCount = menuItems.filter(item => item.separator).length;
    const itemCount = menuItems.filter(item => !item.separator).length;
    const estimatedHeight =
      headerHeight + itemCount * itemHeight + separatorCount * separatorHeight + containerPadding;

    // Cap the estimated height more conservatively
    const menuHeight = Math.min(estimatedHeight, Math.max(300, viewportHeight * 0.7));

    let finalX = x;
    let finalY = y;

    // Horizontal positioning: align left edge with cursor, ensure it stays in viewport
    if (x + menuWidth > viewportWidth - 10) {
      finalX = viewportWidth - menuWidth - 10;
    }
    finalX = Math.max(10, finalX);

    // Vertical positioning: prefer top-left (below cursor), fallback to bottom-left (above cursor)
    const spaceBelow = viewportHeight - y - 10; // Space available below cursor
    const spaceAbove = y - 10; // Space available above cursor

    if (menuHeight <= spaceBelow) {
      // Enough space below - use top-left alignment (cursor at top-left of menu)
      finalY = y;
    } else if (menuHeight <= spaceAbove) {
      // Not enough space below but enough above - use bottom-left alignment (cursor at bottom-left)
      finalY = y - menuHeight;
    } else {
      // Not enough space in either direction - prefer below and let it scroll
      finalY = Math.max(10, y);
    }

    return { x: finalX, y: finalY };
  };

  const position = getMenuPosition();

  return (
    <>
      {/* Backdrop to capture clicks outside menu */}
      <div className="fixed inset-0 z-40" onClick={handleBackdropClick} />

      {/* Context Menu */}
      <div
        className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-56 max-h-screen overflow-y-auto"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
        }}
      >
        {/* Customer Info Header */}
        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-medium text-gray-900">
            {customer.firstName} {customer.lastName}
          </p>
          <p className="text-xs text-gray-500">{customer.email}</p>
          <div className="flex items-center mt-1">
            <span className="text-xs text-gray-500 mr-2">Status:</span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                customer.status === 'Draft'
                  ? 'bg-gray-100 text-charcoal'
                  : customer.status === 'Ready'
                    ? 'bg-blue-100 text-blue-800'
                    : customer.status === 'Scheduled'
                      ? 'bg-yellow-100 text-yellow-800'
                      : customer.status === 'Review Sent'
                        ? 'bg-indigo-100 text-indigo-800'
                        : customer.status === 'Review Clicked'
                          ? 'bg-green-100 text-green-800'
                          : customer.status === 'Review Failed'
                            ? 'bg-red-100 text-red-800'
                            : customer.status === 'Follow-up Sent'
                              ? 'bg-purple-100 text-purple-800'
                              : customer.status === 'Follow-up Clicked'
                                ? 'bg-emerald-100 text-emerald-800'
                                : customer.status === 'Follow-up Failed'
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-gray-100 text-charcoal'
              }`}
            >
              {customer.status}
            </span>
          </div>
        </div>

        {/* Menu Items */}
        <div className="py-1">
          {menuItems.map(item => {
            if (item.separator) {
              return <div key={item.id} className="my-1 border-t border-gray-100" />;
            }

            return (
              <button
                key={item.id}
                className={`
                  w-full flex items-center px-3 py-2 text-sm text-left transition-colors
                  ${
                    item.disabled
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-charcoal hover:bg-gray-50'
                  }
                `}
                onClick={() => handleItemClick(item)}
                disabled={item.disabled}
              >
                {item.icon && <span className="mr-3 flex-shrink-0">{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
