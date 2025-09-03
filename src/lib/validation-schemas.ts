/**
 * Comprehensive Validation Schemas with Security
 *
 * Zod schemas for all API operations with security-focused validation,
 * business rule enforcement, and input sanitization.
 */

import { z } from 'zod';

// ==========================================
// SECURITY VALIDATION CONSTANTS
// ==========================================

export const SECURITY_LIMITS = {
  // Text field limits
  MAX_NAME_LENGTH: 100,
  MAX_EMAIL_LENGTH: 254, // RFC 5321 limit
  MAX_PHONE_LENGTH: 20,
  MAX_ADDRESS_LENGTH: 500,
  MAX_NOTES_LENGTH: 2000,
  MAX_MESSAGE_LENGTH: 1000,
  MAX_SUBJECT_LENGTH: 200,
  MAX_URL_LENGTH: 2048,
  MAX_TAG_LENGTH: 50,
  MAX_TAGS_COUNT: 20,

  // Business limits
  MAX_BUSINESS_NAME_LENGTH: 200,
  MAX_WEBSITE_LENGTH: 255,

  // Import limits
  MAX_IMPORT_ROWS: 1000,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB

  // Message limits by channel
  SMS_MAX_LENGTH: 160,
  EMAIL_SUBJECT_MAX_LENGTH: 78, // RFC 2822 recommendation
  EMAIL_BODY_MAX_LENGTH: 50000,

  // Pagination limits
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE_SIZE: 20,

  // Rate limiting
  MAX_REQUESTS_PER_MINUTE: 60,
  MAX_BULK_OPERATIONS_PER_HOUR: 10,
} as const;

// ==========================================
// BASE VALIDATION UTILITIES
// ==========================================

/**
 * Create a sanitized string validator
 */
export const createSanitizedString = (
  minLength: number = 0,
  maxLength: number = SECURITY_LIMITS.MAX_NAME_LENGTH,
  options: {
    allowEmpty?: boolean;
    trim?: boolean;
    toLowerCase?: boolean;
    pattern?: RegExp;
    customMessage?: string;
  } = {}
) => {
  const {
    allowEmpty = minLength === 0,
    trim = true,
    toLowerCase = false,
    pattern,
    customMessage,
  } = options;

  let schema = z.string({
    required_error: customMessage || 'This field is required',
    invalid_type_error: customMessage || 'Must be a valid string',
  });

  if (trim) {
    schema = schema.trim();
  }

  if (toLowerCase) {
    schema = schema.toLowerCase();
  }

  // Length validation
  if (!allowEmpty || minLength > 0) {
    schema = schema.min(minLength, {
      message: `Must be at least ${minLength} characters long`,
    });
  }

  schema = schema.max(maxLength, {
    message: `Must be no more than ${maxLength} characters long`,
  });

  // Pattern validation
  if (pattern) {
    schema = schema.regex(pattern, {
      message: customMessage || 'Invalid format',
    });
  }

  // HTML/script tag detection for XSS prevention
  schema = schema.refine(
    value => {
      if (!value) return true;
      const htmlPattern = /<[^>]*>/gi;
      const scriptPattern = /<script[^>]*>.*?<\/script>/gis;
      return !htmlPattern.test(value) || !scriptPattern.test(value);
    },
    {
      message: 'HTML tags are not allowed',
    }
  );

  return schema;
};

/**
 * Email validation with comprehensive checks
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Must be a valid email address')
  .max(SECURITY_LIMITS.MAX_EMAIL_LENGTH, 'Email address too long')
  .refine(
    email => {
      // Additional email security checks
      const suspiciousPatterns = [
        /[<>'"]/, // HTML/JS injection characters
        /javascript:/i,
        /data:/i,
        /vbscript:/i,
      ];
      return !suspiciousPatterns.some(pattern => pattern.test(email));
    },
    {
      message: 'Email contains invalid characters',
    }
  );

/**
 * Phone number validation with international support
 */
export const phoneSchema = z
  .string()
  .trim()
  .max(SECURITY_LIMITS.MAX_PHONE_LENGTH, 'Phone number too long')
  .regex(
    /^[\+]?[\d\s\-\(\)\.]{7,20}$/,
    'Must be a valid phone number (7-20 digits, may include +, spaces, hyphens, parentheses)'
  )
  .transform(phone => {
    // Normalize phone number (remove formatting)
    return phone.replace(/[\s\-\(\)\.]/g, '');
  });

/**
 * UUID validation
 */
export const uuidSchema = z.string().uuid('Must be a valid UUID');

/**
 * URL validation with security checks
 */
export const urlSchema = z
  .string()
  .trim()
  .url('Must be a valid URL')
  .max(SECURITY_LIMITS.MAX_URL_LENGTH, 'URL too long')
  .refine(
    url => {
      try {
        const parsed = new URL(url);
        // Only allow http/https protocols
        return ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    },
    {
      message: 'Only HTTP and HTTPS URLs are allowed',
    }
  );

/**
 * Tag validation
 */
export const tagSchema = createSanitizedString(1, SECURITY_LIMITS.MAX_TAG_LENGTH, {
  pattern: /^[a-zA-Z0-9\-_\s]+$/,
  customMessage: 'Tags can only contain letters, numbers, hyphens, underscores, and spaces',
});

/**
 * Array of tags with limits
 */
export const tagsArraySchema = z
  .array(tagSchema)
  .max(SECURITY_LIMITS.MAX_TAGS_COUNT, `Maximum ${SECURITY_LIMITS.MAX_TAGS_COUNT} tags allowed`)
  .default([])
  .transform(tags => {
    // Remove duplicates and empty tags
    return Array.from(new Set(tags.filter(tag => tag.trim().length > 0)));
  });

// ==========================================
// PAGINATION SCHEMAS
// ==========================================

export const paginationSchema = z.object({
  page: z
    .union([z.string(), z.number()])
    .transform(val => parseInt(val.toString(), 10))
    .refine(val => val >= 1, 'Page must be 1 or greater')
    .default(1),

  limit: z
    .union([z.string(), z.number()])
    .transform(val => parseInt(val.toString(), 10))
    .refine(
      val => val >= 1 && val <= SECURITY_LIMITS.MAX_PAGE_SIZE,
      `Limit must be between 1 and ${SECURITY_LIMITS.MAX_PAGE_SIZE}`
    )
    .default(SECURITY_LIMITS.DEFAULT_PAGE_SIZE),
});

export const searchSchema = z.object({
  search: createSanitizedString(0, 100, { allowEmpty: true }).optional(),
  tags: z
    .string()
    .optional()
    .transform(tags => {
      if (!tags) return undefined;
      return tags
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean);
    }),
});

// ==========================================
// CUSTOMER SCHEMAS
// ==========================================

export const createCustomerSchema = z
  .object({
    firstName: createSanitizedString(1, SECURITY_LIMITS.MAX_NAME_LENGTH, {
      customMessage: 'First name is required and must be 1-100 characters',
    }),

    lastName: createSanitizedString(0, SECURITY_LIMITS.MAX_NAME_LENGTH, {
      allowEmpty: true,
    }).optional(),

    email: emailSchema.optional(),

    phone: phoneSchema.optional(),

    address: createSanitizedString(0, SECURITY_LIMITS.MAX_ADDRESS_LENGTH, {
      allowEmpty: true,
    }).optional(),

    notes: createSanitizedString(0, SECURITY_LIMITS.MAX_NOTES_LENGTH, {
      allowEmpty: true,
    }).optional(),

    tags: tagsArraySchema,
  })
  .refine(data => data.email || data.phone, {
    message: 'Either email or phone number is required',
    path: ['email'],
  });

export const updateCustomerSchema = createCustomerSchema.partial().refine(
  data => {
    // If email or phone is being updated, ensure at least one remains
    const hasEmail = data.email !== undefined && data.email !== '';
    const hasPhone = data.phone !== undefined && data.phone !== '';

    if (data.email === '' && !hasPhone) {
      return false; // Can't remove email without phone
    }
    if (data.phone === '' && !hasEmail) {
      return false; // Can't remove phone without email
    }

    return true;
  },
  {
    message: 'Customer must have at least email or phone number',
    path: ['email'],
  }
);

export const customerQuerySchema = paginationSchema.merge(searchSchema).extend({
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  sortBy: z.enum(['name', 'email', 'createdAt', 'lastContact']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const customerParamsSchema = z.object({
  id: uuidSchema,
});

// Bulk customer import schema
export const importCustomersSchema = z
  .object({
    customers: z
      .array(createCustomerSchema)
      .min(1, 'At least one customer is required')
      .max(
        SECURITY_LIMITS.MAX_IMPORT_ROWS,
        `Maximum ${SECURITY_LIMITS.MAX_IMPORT_ROWS} customers allowed per import`
      ),

    skipDuplicates: z.boolean().default(true),

    validateOnly: z.boolean().default(false), // For validation-only runs
  })
  .refine(
    data => {
      // Additional validation for bulk import
      const emails = new Set();
      const phones = new Set();

      for (const customer of data.customers) {
        if (customer.email) {
          if (emails.has(customer.email)) {
            return false; // Duplicate email in import
          }
          emails.add(customer.email);
        }

        if (customer.phone) {
          if (phones.has(customer.phone)) {
            return false; // Duplicate phone in import
          }
          phones.add(customer.phone);
        }
      }

      return true;
    },
    {
      message: 'Duplicate email or phone numbers found in import data',
      path: ['customers'],
    }
  );

// ==========================================
// REVIEW REQUEST SCHEMAS
// ==========================================

export const createReviewRequestSchema = z
  .object({
    customerId: uuidSchema,

    channel: z.enum(['SMS', 'EMAIL'], {
      required_error: 'Channel is required',
      invalid_type_error: 'Channel must be SMS or EMAIL',
    }),

    subject: createSanitizedString(0, SECURITY_LIMITS.MAX_SUBJECT_LENGTH, {
      allowEmpty: true,
    }).optional(),

    messageContent: createSanitizedString(1, SECURITY_LIMITS.MAX_MESSAGE_LENGTH, {
      customMessage: 'Message content is required',
    }),

    reviewUrl: urlSchema.optional(),

    scheduledFor: z
      .string()
      .datetime({ message: 'Must be a valid ISO datetime' })
      .optional()
      .transform(date => (date ? new Date(date) : undefined))
      .refine(date => !date || date > new Date(), {
        message: 'Scheduled time must be in the future',
      }),
  })
  .refine(
    data => {
      // Validate message length based on channel
      if (data.channel === 'SMS' && data.messageContent.length > SECURITY_LIMITS.SMS_MAX_LENGTH) {
        return false;
      }

      // Email must have subject if channel is EMAIL
      if (data.channel === 'EMAIL' && !data.subject?.trim()) {
        return false;
      }

      return true;
    },
    data => ({
      message:
        data.channel === 'SMS'
          ? `SMS messages must be ${SECURITY_LIMITS.SMS_MAX_LENGTH} characters or less`
          : 'Email messages must have a subject',
      path: data.channel === 'SMS' ? ['messageContent'] : ['subject'],
    })
  );

export const updateReviewRequestSchema = z.object({
  status: z
    .enum(['QUEUED', 'SENT', 'DELIVERED', 'CLICKED', 'BOUNCED', 'FAILED', 'OPTED_OUT', 'COMPLETED'])
    .optional(),

  scheduledFor: z
    .string()
    .datetime()
    .optional()
    .transform(date => (date ? new Date(date) : undefined))
    .refine(date => !date || date > new Date(), 'Scheduled time must be in the future'),

  notes: createSanitizedString(0, SECURITY_LIMITS.MAX_NOTES_LENGTH, {
    allowEmpty: true,
  }).optional(),
});

export const reviewRequestQuerySchema = paginationSchema.merge(searchSchema).extend({
  status: z
    .enum([
      'QUEUED',
      'SENT',
      'DELIVERED',
      'CLICKED',
      'BOUNCED',
      'FAILED',
      'OPTED_OUT',
      'COMPLETED',
      'all',
    ])
    .optional(),
  channel: z.enum(['SMS', 'EMAIL', 'all']).optional(),
  customerId: uuidSchema.optional(),
  dateFrom: z
    .string()
    .datetime()
    .optional()
    .transform(date => (date ? new Date(date) : undefined)),
  dateTo: z
    .string()
    .datetime()
    .optional()
    .transform(date => (date ? new Date(date) : undefined)),
  sortBy: z.enum(['createdAt', 'scheduledFor', 'sentAt', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const reviewRequestParamsSchema = z.object({
  id: uuidSchema,
});

// Bulk review request creation
export const createBulkReviewRequestsSchema = z
  .object({
    customerIds: z
      .array(uuidSchema)
      .min(1, 'At least one customer ID is required')
      .max(100, 'Maximum 100 customers per bulk request'),

    channel: z.enum(['SMS', 'EMAIL']),

    subject: createSanitizedString(0, SECURITY_LIMITS.MAX_SUBJECT_LENGTH, {
      allowEmpty: true,
    }).optional(),

    messageContent: createSanitizedString(1, SECURITY_LIMITS.MAX_MESSAGE_LENGTH),

    reviewUrl: urlSchema.optional(),

    scheduledFor: z
      .string()
      .datetime()
      .optional()
      .transform(date => (date ? new Date(date) : undefined))
      .refine(date => !date || date > new Date(), 'Scheduled time must be in the future'),
  })
  .refine(
    data => {
      // Validate message length and subject requirements
      if (data.channel === 'SMS' && data.messageContent.length > SECURITY_LIMITS.SMS_MAX_LENGTH) {
        return false;
      }

      if (data.channel === 'EMAIL' && !data.subject?.trim()) {
        return false;
      }

      return true;
    },
    data => ({
      message:
        data.channel === 'SMS'
          ? `SMS messages must be ${SECURITY_LIMITS.SMS_MAX_LENGTH} characters or less`
          : 'Email messages must have a subject',
      path: data.channel === 'SMS' ? ['messageContent'] : ['subject'],
    })
  );

// ==========================================
// BUSINESS SCHEMAS
// ==========================================

export const updateBusinessSchema = z.object({
  name: createSanitizedString(1, SECURITY_LIMITS.MAX_BUSINESS_NAME_LENGTH, {
    customMessage: 'Business name is required',
  }).optional(),

  email: emailSchema.optional(),

  phone: phoneSchema.optional(),

  address: createSanitizedString(0, SECURITY_LIMITS.MAX_ADDRESS_LENGTH, {
    allowEmpty: true,
  }).optional(),

  website: urlSchema.optional(),

  timezone: z.string().min(1, 'Timezone is required').max(50, 'Timezone too long').optional(),

  smsCreditsLimit: z
    .number()
    .int()
    .min(0, 'SMS credits limit must be non-negative')
    .max(100000, 'SMS credits limit too high')
    .optional(),

  emailCreditsLimit: z
    .number()
    .int()
    .min(0, 'Email credits limit must be non-negative')
    .max(1000000, 'Email credits limit too high')
    .optional(),
});

// ==========================================
// SUPPRESSION SCHEMAS
// ==========================================

export const createSuppressionSchema = z.object({
  contact: z
    .string()
    .trim()
    .min(1, 'Contact is required')
    .max(254, 'Contact too long')
    .refine(
      contact => {
        // Validate as email or phone
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phoneRegex = /^[\+]?[\d\s\-\(\)\.]{7,20}$/;
        return emailRegex.test(contact) || phoneRegex.test(contact);
      },
      {
        message: 'Contact must be a valid email or phone number',
      }
    ),

  channel: z.enum(['SMS', 'EMAIL']).optional(),

  reason: z.enum([
    'SMS_STOP',
    'EMAIL_UNSUBSCRIBE',
    'EMAIL_BOUNCE',
    'EMAIL_SPAM_COMPLAINT',
    'MANUAL',
    'GDPR_REQUEST',
  ]),

  notes: createSanitizedString(0, SECURITY_LIMITS.MAX_NOTES_LENGTH, {
    allowEmpty: true,
  }).optional(),

  expiresAt: z
    .string()
    .datetime()
    .optional()
    .transform(date => (date ? new Date(date) : undefined))
    .refine(date => !date || date > new Date(), 'Expiration date must be in the future'),
});

export const suppressionQuerySchema = paginationSchema.extend({
  channel: z.enum(['SMS', 'EMAIL', 'all']).optional(),
  reason: z
    .enum([
      'SMS_STOP',
      'EMAIL_UNSUBSCRIBE',
      'EMAIL_BOUNCE',
      'EMAIL_SPAM_COMPLAINT',
      'MANUAL',
      'GDPR_REQUEST',
      'all',
    ])
    .optional(),
  contact: createSanitizedString(0, 100, { allowEmpty: true }).optional(),
  active: z.enum(['true', 'false', 'all']).default('true'),
});

// ==========================================
// FILE UPLOAD SCHEMAS
// ==========================================

export const fileUploadSchema = z.object({
  filename: createSanitizedString(1, 255, {
    pattern: /^[a-zA-Z0-9\-_\.\s]+$/,
    customMessage: 'Filename contains invalid characters',
  }),

  mimetype: z.string().refine(
    mimetype => {
      const allowedTypes = [
        'text/csv',
        'application/csv',
        'text/plain',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ];
      return allowedTypes.includes(mimetype);
    },
    {
      message: 'Only CSV and Excel files are allowed',
    }
  ),

  size: z
    .number()
    .max(
      SECURITY_LIMITS.MAX_FILE_SIZE,
      `File size must be less than ${SECURITY_LIMITS.MAX_FILE_SIZE / 1024 / 1024}MB`
    ),
});

// ==========================================
// WEBHOOK SCHEMAS
// ==========================================

export const webhookEventSchema = z.object({
  type: z.string().min(1, 'Event type is required'),
  data: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime().optional(),
  signature: z.string().optional(),
});

// ==========================================
// ANALYTICS SCHEMAS
// ==========================================

export const analyticsQuerySchema = z
  .object({
    dateFrom: z
      .string()
      .datetime()
      .optional()
      .transform(date => (date ? new Date(date) : undefined)),

    dateTo: z
      .string()
      .datetime()
      .optional()
      .transform(date => (date ? new Date(date) : undefined)),

    granularity: z.enum(['hour', 'day', 'week', 'month']).default('day'),

    metrics: z
      .string()
      .optional()
      .transform(metrics => {
        if (!metrics) return undefined;
        return metrics.split(',').map(m => m.trim());
      }),
  })
  .refine(
    data => {
      if (data.dateFrom && data.dateTo) {
        return data.dateFrom < data.dateTo;
      }
      return true;
    },
    {
      message: 'dateFrom must be before dateTo',
      path: ['dateFrom'],
    }
  );

// ==========================================
// EXPORT UTILITY TYPES
// ==========================================

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerQueryInput = z.infer<typeof customerQuerySchema>;
export type ImportCustomersInput = z.infer<typeof importCustomersSchema>;

export type CreateReviewRequestInput = z.infer<typeof createReviewRequestSchema>;
export type UpdateReviewRequestInput = z.infer<typeof updateReviewRequestSchema>;
export type ReviewRequestQueryInput = z.infer<typeof reviewRequestQuerySchema>;
export type CreateBulkReviewRequestsInput = z.infer<typeof createBulkReviewRequestsSchema>;

export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
export type CreateSuppressionInput = z.infer<typeof createSuppressionSchema>;
export type SuppressionQueryInput = z.infer<typeof suppressionQuerySchema>;

export type FileUploadInput = z.infer<typeof fileUploadSchema>;
export type WebhookEventInput = z.infer<typeof webhookEventSchema>;
export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
