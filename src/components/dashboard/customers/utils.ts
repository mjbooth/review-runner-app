import type { CustomerTableColumn } from './types';

/**
 * Format UK phone number for display: 07823337419 → 07823 337 419
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return '';

  // Remove all non-digits for consistent processing
  const cleaned = phone.replace(/\D/g, '');

  // Mobile numbers: 07xxxxxxxxx → 07xxx xxx xxx
  if (cleaned.startsWith('07') && cleaned.length === 11) {
    return cleaned.replace(/(\d{5})(\d{3})(\d{3})/, '$1 $2 $3');
  }

  // London numbers: 020xxxxxxxx → 020 xxxx xxxx
  if (cleaned.startsWith('020') && cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{4})(\d{4})/, '$1 $2 $3');
  }

  // Other area codes: 01xxx xxxxxx → 01xxx xxx xxx
  if (cleaned.startsWith('01') && cleaned.length === 11) {
    return cleaned.replace(/(\d{5})(\d{3})(\d{3})/, '$1 $2 $3');
  }

  // Fallback: return original if can't format
  return phone;
}

/**
 * Format ISO date to human-friendly format: "15 Jan 2024"
 */
export function formatDate(isoString: string | null): string {
  if (!isoString) return '—';

  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(isoString));
  } catch (error) {
    return 'Invalid date';
  }
}

/**
 * Format name to title case: "john" → "John"
 */
export function formatName(name: string): string {
  if (!name) return '';
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/**
 * Get display text for channel
 */
export function formatChannel(channel: 'email' | 'sms' | null): string {
  if (!channel) return '—';
  // Capitalize first letter only for better readability
  return channel.charAt(0).toUpperCase() + channel.slice(1).toLowerCase();
}

/**
 * Generate initials from first and last name
 */
export function getInitials(firstName: string, lastName: string): string {
  const first = firstName?.charAt(0)?.toUpperCase() || '';
  const last = lastName?.charAt(0)?.toUpperCase() || '';
  return `${first}${last}`;
}

/**
 * Table column definitions
 */
export const customerTableColumns: CustomerTableColumn[] = [
  { key: 'firstName', label: 'First', sortable: true },
  { key: 'lastName', label: 'Last', sortable: true },
  { key: 'email', label: 'Email', sortable: true },
  { key: 'phone', label: 'Phone', sortable: false },
  { key: 'dateAdded', label: 'Added', sortable: true },
  { key: 'suppressed', label: 'Suppressed', sortable: true, className: 'text-center' },
  { key: 'lastRequest', label: 'Last Request', sortable: true, mobileHidden: true },
  { key: 'status', label: 'Status', sortable: false, mobileHidden: true },
  { key: 'channel', label: 'Channel', sortable: true, mobileHidden: true },
  { key: 'actions', label: 'Actions', sortable: false, mobileHidden: true },
];
