import type { ValidationRule, Customer } from '../types/customer';

export const validationRules: ValidationRule[] = [
  {
    field: 'firstName',
    rules: {
      required: true,
      pattern: /^[a-zA-Z\s\-']{1,50}$/,
      custom: (value: string) => {
        if (!value || value.trim().length < 2) {
          return 'First name must be at least 2 characters';
        }
        if (value.trim().length > 50) {
          return 'First name must be less than 50 characters';
        }
        return null;
      },
    },
  },
  {
    field: 'lastName',
    rules: {
      required: true,
      pattern: /^[a-zA-Z\s\-']{1,50}$/,
      custom: (value: string) => {
        if (!value || value.trim().length < 2) {
          return 'Last name must be at least 2 characters';
        }
        if (value.trim().length > 50) {
          return 'Last name must be less than 50 characters';
        }
        return null;
      },
    },
  },
  {
    field: 'email',
    rules: {
      required: true,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      custom: (value: string) => {
        if (!value) {
          return 'Email is required';
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          return 'Please enter a valid email address';
        }
        if (value.length > 254) {
          return 'Email address is too long';
        }
        return null;
      },
    },
  },
  {
    field: 'phone',
    rules: {
      required: true,
      pattern: /^\+44\s?\d{4}\s?\d{3}\s?\d{3}$/,
      custom: (value: string) => {
        if (!value) {
          return 'Phone number is required';
        }
        return validateUKPhoneNumber(value);
      },
    },
  },
];

export function validateUKPhoneNumber(phone: string): string | null {
  // Remove all spaces and formatting
  const cleaned = phone.replace(/\s/g, '');

  // Check if it starts with +44
  if (!cleaned.startsWith('+44')) {
    return 'Phone number must start with +44';
  }

  // Check total length (should be +44 + 10 digits = 13 characters)
  if (cleaned.length !== 13) {
    return 'UK phone number must be 10 digits after +44';
  }

  // Check if all characters after +44 are digits
  const digits = cleaned.slice(3);
  if (!/^\d{10}$/.test(digits)) {
    return 'Phone number must contain only digits after +44';
  }

  // Check if it starts with valid UK mobile prefixes or landline
  const prefix = digits.slice(0, 2);
  const validMobilePrefixes = ['74', '75', '76', '77', '78', '79'];
  const validLandlinePrefixes = ['11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];

  if (!validMobilePrefixes.includes(prefix) && !validLandlinePrefixes.includes(prefix)) {
    return 'Invalid UK phone number prefix';
  }

  return null;
}

export function validateField(
  field: keyof Customer,
  value: any,
  customer?: Customer
): string | null {
  const rule = validationRules.find(r => r.field === field);
  if (!rule) return null;

  const { required, pattern, custom } = rule.rules;

  // Required validation
  if (required && (!value || (typeof value === 'string' && value.trim() === ''))) {
    return `${field} is required`;
  }

  // Pattern validation
  if (pattern && typeof value === 'string' && !pattern.test(value)) {
    return `Invalid ${field} format`;
  }

  // Custom validation
  if (custom) {
    return custom(value, customer);
  }

  return null;
}

export function formatPhoneNumber(phone: string): string {
  // Clean the phone number
  const cleaned = phone.replace(/\s/g, '');

  // If it doesn't start with +44, try to convert UK format
  if (!cleaned.startsWith('+44')) {
    if (cleaned.startsWith('0')) {
      return `+44 ${cleaned.slice(1, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8)}`;
    }
    return phone; // Return original if can't format
  }

  // Format +44XXXXXXXXXX to +44 XXXX XXX XXX
  const digits = cleaned.slice(3);
  if (digits.length === 10) {
    return `+44 ${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }

  return phone;
}

export function debounce<T extends (...args: any[]) => void>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
}
