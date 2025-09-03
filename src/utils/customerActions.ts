import type { Customer, CustomerAction } from '../types/customer';

export function getCustomerActions(customer: Customer): CustomerAction[] {
  const actions: CustomerAction[] = [];
  const now = new Date();

  // Calculate days since last request
  const lastRequestDate = customer.lastRequest ? new Date(customer.lastRequest) : null;
  const daysSinceLastRequest = lastRequestDate
    ? Math.floor((now.getTime() - lastRequestDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // If customer is suppressed, only allow viewing history
  if (customer.suppressed) {
    actions.push({
      type: 'view-history',
      label: 'View History',
      variant: 'secondary',
      disabled: false,
    });
    return actions;
  }

  // Determine primary action based on customer state
  switch (customer.status) {
    case 'Clicked':
    case 'Responded':
      // Customer engaged - offer follow-up
      actions.push({
        type: 'follow-up',
        label: 'Follow Up',
        variant: 'primary',
        disabled: false,
        tooltip: 'Send a follow-up message to this engaged customer',
      });
      actions.push({
        type: 'view-history',
        label: 'View History',
        variant: 'secondary',
        disabled: false,
      });
      break;

    case 'Delivered':
    case 'Opened':
      // Message delivered but no response yet
      if (daysSinceLastRequest !== null && daysSinceLastRequest < 7) {
        // Recent delivery - wait before follow-up
        actions.push({
          type: 'view-history',
          label: 'View History',
          variant: 'primary',
          disabled: false,
        });
        actions.push({
          type: 'follow-up',
          label: 'Follow Up',
          variant: 'secondary',
          disabled: true,
          tooltip: `Wait ${7 - daysSinceLastRequest} more days before follow-up`,
        });
      } else {
        // Can follow up now
        actions.push({
          type: 'follow-up',
          label: 'Follow Up',
          variant: 'primary',
          disabled: false,
        });
        actions.push({
          type: 'view-history',
          label: 'View History',
          variant: 'secondary',
          disabled: false,
        });
      }
      break;

    case 'Bounced':
      // Contact details may be invalid
      actions.push({
        type: 'update-contact',
        label: 'Update Contact',
        variant: 'primary',
        disabled: false,
        tooltip: 'Update contact details due to delivery failure',
      });

      // Offer alternative channel if available
      const alternativeChannel = customer.channel === 'Email' ? 'SMS' : 'Email';
      actions.push({
        type: 'send-now',
        label: `Try ${alternativeChannel}`,
        variant: 'secondary',
        disabled: false,
        tooltip: `Try reaching customer via ${alternativeChannel.toLowerCase()}`,
      });

      actions.push({
        type: 'view-history',
        label: 'View History',
        variant: 'secondary',
        disabled: false,
      });
      break;

    case 'Unsubscribed':
      // Customer unsubscribed - limited options
      actions.push({
        type: 're-engage',
        label: 'Re-engagement',
        variant: 'secondary',
        disabled: false,
        tooltip: 'Send re-engagement campaign (if permitted)',
      });
      actions.push({
        type: 'view-history',
        label: 'View History',
        variant: 'secondary',
        disabled: false,
      });
      actions.push({
        type: 'suppress',
        label: 'Suppress',
        variant: 'danger',
        disabled: false,
        tooltip: 'Permanently suppress this customer',
      });
      break;

    case 'Archived':
    case 'Saved':
      // Inactive customers
      actions.push({
        type: 'send-now',
        label: 'Send Now',
        variant: 'secondary',
        disabled: false,
        tooltip: 'Reactivate this customer with a new request',
      });
      actions.push({
        type: 'view-history',
        label: 'View History',
        variant: 'secondary',
        disabled: false,
      });
      break;

    case 'Forwarded':
      // Message was forwarded - good engagement
      actions.push({
        type: 'follow-up',
        label: 'Follow Up',
        variant: 'primary',
        disabled: false,
        tooltip: 'Customer forwarded your message - great engagement!',
      });
      actions.push({
        type: 'view-history',
        label: 'View History',
        variant: 'secondary',
        disabled: false,
      });
      break;

    default:
      // Never contacted or unknown status
      if (!customer.lastRequest) {
        // Never contacted
        actions.push({
          type: 'send-now',
          label: 'Send Now',
          variant: 'primary',
          disabled: false,
          tooltip: 'Send first review request to this customer',
        });
        actions.push({
          type: 'schedule',
          label: 'Schedule',
          variant: 'secondary',
          disabled: false,
          tooltip: 'Schedule a review request for later',
        });
      } else {
        // Has been contacted before but status unclear
        actions.push({
          type: 'follow-up',
          label: 'Follow Up',
          variant: 'primary',
          disabled: false,
        });
        actions.push({
          type: 'view-history',
          label: 'View History',
          variant: 'secondary',
          disabled: false,
        });
      }
      break;
  }

  // Always allow suppression for non-suppressed customers (as last resort)
  if (!customer.suppressed && !actions.some(a => a.type === 'suppress')) {
    actions.push({
      type: 'suppress',
      label: 'Suppress',
      variant: 'danger',
      disabled: false,
      tooltip: 'Stop all communications with this customer',
    });
  }

  return actions;
}

export function getActionButtonVariant(variant: CustomerAction['variant']): string {
  switch (variant) {
    case 'primary':
      return 'bg-blue-600 hover:bg-blue-700 text-white';
    case 'secondary':
      return 'bg-gray-100 hover:bg-gray-200 text-gray-700';
    case 'danger':
      return 'bg-red-600 hover:bg-red-700 text-white';
    default:
      return 'bg-gray-100 hover:bg-gray-200 text-gray-700';
  }
}

export function getDisabledButtonStyle(): string {
  return 'bg-gray-50 text-gray-400 cursor-not-allowed';
}

export function getPrimaryAction(actions: CustomerAction[]): CustomerAction | null {
  return actions.find(action => action.variant === 'primary' && !action.disabled) || null;
}

export function getSecondaryActions(actions: CustomerAction[]): CustomerAction[] {
  return actions.filter(action => action.variant !== 'primary' || action.disabled);
}
