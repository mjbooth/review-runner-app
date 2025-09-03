import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { RequestChannel } from '@prisma/client';

// Tailwind CSS class name utility
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Date formatting utilities
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    ...options,
  }).format(dateObj);
}

export function formatDateTime(date: Date | string): string {
  return formatDate(date, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeAgo(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'week', seconds: 604800 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 },
    { label: 'second', seconds: 1 },
  ];

  for (const interval of intervals) {
    const count = Math.floor(diffInSeconds / interval.seconds);
    if (count >= 1) {
      return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
    }
  }

  return 'just now';
}

// String utilities
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Validation utilities
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidUKPhone(phone: string | null | undefined): boolean {
  if (!phone || typeof phone !== 'string') return false;

  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');

  // UK mobile numbers: 12 digits starting with 44 or 10-11 digits starting with 0
  // UK landline numbers: similar patterns
  if (digits.length === 12 && digits.startsWith('44')) {
    return /^44[1-9]\d{9}$/.test(digits);
  }

  if ((digits.length === 10 || digits.length === 11) && digits.startsWith('0')) {
    return /^0[1-9]\d{8,9}$/.test(digits);
  }

  return false;
}

export function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  // Convert UK numbers to international format
  if (digits.length === 10 && digits.startsWith('0')) {
    return '+44' + digits.substring(1);
  }

  if (digits.length === 11 && digits.startsWith('44')) {
    return '+' + digits;
  }

  return phone; // Return as-is if can't normalize
}

// Business logic utilities
export function getContactForChannel(
  customer: { email: string | null; phone: string | null },
  channel: RequestChannel
): string | null {
  if (channel === 'EMAIL') return customer.email;
  if (channel === 'SMS') return customer.phone;
  return null;
}

export function canSendToCustomer(
  customer: { email: string | null; phone: string | null },
  channel: RequestChannel
): boolean {
  const contact = getContactForChannel(customer, channel);
  if (!contact) return false;

  if (channel === 'EMAIL') return isValidEmail(contact);
  if (channel === 'SMS') return isValidUKPhone(contact);

  return false;
}

export function generateTrackingUrl(baseUrl: string, uuid: string): string {
  return `${baseUrl}/r/${uuid}`;
}

export function generateUnsubscribeUrl(baseUrl: string, uuid: string): string {
  return `${baseUrl}/r/unsubscribe/${uuid}`;
}

// Array utilities
export function unique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

export function groupBy<T, K extends keyof T>(array: T[], key: K): Record<string, T[]> {
  return array.reduce(
    (groups, item) => {
      const group = String(item[key]);
      groups[group] = groups[group] || [];
      groups[group].push(item);
      return groups;
    },
    {} as Record<string, T[]>
  );
}

export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Number utilities
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatCurrency(amount: number, currency: string = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Environment utilities
export function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

export function getEnvVar(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export function getBooleanEnvVar(name: string, defaultValue: boolean = false): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export function getNumericEnvVar(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Type guards
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Error handling
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

// Async utilities
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  attempts: number = 3,
  delay: number = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (attempts <= 1) throw error;

    await sleep(delay);
    return retry(fn, attempts - 1, delay * 2); // Exponential backoff
  }
}

// URL utilities
export function buildUrl(base: string, path: string, params?: Record<string, string>): string {
  const url = new URL(path, base);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  return url.toString();
}
