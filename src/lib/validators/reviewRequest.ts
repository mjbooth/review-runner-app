import { z } from 'zod';

// Enums matching Prisma schema
export const RequestChannelEnum = z.enum(['SMS', 'EMAIL']);
export const RequestStatusEnum = z.enum([
  'DRAFT',
  'QUEUED',
  'SENT',
  'DELIVERED',
  'CLICKED',
  'BOUNCED',
  'FAILED',
  'OPTED_OUT',
  'COMPLETED',
]);

export const TemplateCategoryEnum = z.enum([
  'GENERAL',
  'RESTAURANT',
  'RETAIL',
  'HEALTHCARE',
  'SERVICE',
  'CUSTOM',
]);

// Base validation schemas
export const uuidSchema = z.string().uuid();
export const businessIdSchema = z.string().uuid();
export const customerIdSchema = z.string().uuid();

// Template ID schema - accepts UUID or template identifiers
export const templateIdSchema = z.string().refine(
  val => {
    // Accept UUIDs or template IDs (like "email-initial-brief", "system-email-general", etc.)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const systemTemplateRegex = /^system-[a-z]+-[a-z]+$/;
    const customTemplateRegex = /^[a-z]+-[a-z]+-[a-z]+$/; // Matches "email-initial-brief", "sms-followup-gentle", etc.
    return uuidRegex.test(val) || systemTemplateRegex.test(val) || customTemplateRegex.test(val);
  },
  {
    message:
      "Template ID must be a valid UUID or template identifier (e.g., 'email-initial-brief', 'system-email-general')",
  }
);

// Review Request validation schemas
export const createReviewRequestSchema = z.object({
  customerId: customerIdSchema,
  templateId: templateIdSchema.optional(),
  channel: RequestChannelEnum,
  subject: z.string().max(200).optional(),
  messageContent: z.string().min(1).max(1600), // Max for SMS segments
  reviewUrl: z.string().url(),
  scheduledFor: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});

export const updateReviewRequestSchema = z.object({
  status: RequestStatusEnum.optional(),
  personalizedMessage: z.string().max(1600).optional(),
  sentAt: z.string().datetime().optional(),
  deliveredAt: z.string().datetime().optional(),
  clickedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  externalId: z.string().max(100).optional(),
  errorMessage: z.string().max(500).optional(),
  retryCount: z.number().int().min(0).max(5).optional(),
  deliveryStatus: z.record(z.any()).optional(),
  clickMetadata: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

export const bulkCreateReviewRequestSchema = z.object({
  customerIds: z.array(customerIdSchema).min(1).max(1000),
  templateId: templateIdSchema.optional(),
  channel: RequestChannelEnum,
  subject: z.string().max(200).optional(),
  messageContent: z.string().min(1).max(1600),
  reviewUrl: z.string().url(),
  scheduledFor: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});

// Template validation helpers
const requiredPersonalizationVariables = ['customerName', 'businessName', 'reviewUrl'];
const optionalPersonalizationVariables = ['firstName', 'lastName', 'email', 'phone', 'website'];
const allValidVariables = [
  ...requiredPersonalizationVariables,
  ...optionalPersonalizationVariables,
];

// Extract variables from template content
const extractVariables = (content: string): string[] => {
  const matches = content.match(/{{([^}]+)}}/g);
  return matches ? matches.map(match => match.slice(2, -2).trim()) : [];
};

// Message Template validation schemas
export const createMessageTemplateSchema = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    category: TemplateCategoryEnum.default('GENERAL'),
    channel: RequestChannelEnum,
    subject: z.string().max(200).optional(),
    content: z.string().min(1).max(1600),
    templateType: z.enum(['system', 'business']).default('business'),
    variables: z.array(z.string().max(50)).default([]),
  })
  .refine(
    data => {
      // Validate SMS character limits
      if (data.channel === 'SMS' && data.content.length > 160) {
        // Allow longer content but warn - will be split into segments
      }
      return true;
    },
    {
      message: 'Template content validation failed',
    }
  )
  .refine(
    data => {
      // Extract and validate personalization variables
      const contentVariables = extractVariables(data.content);
      const subjectVariables = data.subject ? extractVariables(data.subject) : [];
      const allTemplateVariables = [...contentVariables, ...subjectVariables];

      // Check for invalid variables
      const invalidVariables = allTemplateVariables.filter(v => !allValidVariables.includes(v));
      if (invalidVariables.length > 0) {
        throw new Error(`Invalid personalization variables: ${invalidVariables.join(', ')}`);
      }

      // Check for required variables
      const hasCustomerName =
        allTemplateVariables.includes('customerName') ||
        (allTemplateVariables.includes('firstName') && allTemplateVariables.includes('lastName'));
      const hasBusinessName = allTemplateVariables.includes('businessName');
      const hasReviewUrl = allTemplateVariables.includes('reviewUrl');

      if (!hasCustomerName) {
        throw new Error(
          'Template must include {{customerName}} or both {{firstName}} and {{lastName}}'
        );
      }
      if (!hasBusinessName) {
        throw new Error('Template must include {{businessName}}');
      }
      if (!hasReviewUrl) {
        throw new Error('Template must include {{reviewUrl}}');
      }

      return true;
    },
    {
      message: 'Required personalization variables missing',
    }
  );

export const updateMessageTemplateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    category: TemplateCategoryEnum.optional(),
    subject: z.string().max(200).optional(),
    content: z.string().min(1).max(1600).optional(),
    variables: z.array(z.string().max(50)).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    data => {
      // If content is being updated, validate personalization variables
      if (data.content) {
        const contentVariables = extractVariables(data.content);
        const subjectVariables = data.subject ? extractVariables(data.subject) : [];
        const allTemplateVariables = [...contentVariables, ...subjectVariables];

        // Check for invalid variables
        const invalidVariables = allTemplateVariables.filter(v => !allValidVariables.includes(v));
        if (invalidVariables.length > 0) {
          throw new Error(`Invalid personalization variables: ${invalidVariables.join(', ')}`);
        }

        // Check for required variables
        const hasCustomerName =
          allTemplateVariables.includes('customerName') ||
          (allTemplateVariables.includes('firstName') && allTemplateVariables.includes('lastName'));
        const hasBusinessName = allTemplateVariables.includes('businessName');
        const hasReviewUrl = allTemplateVariables.includes('reviewUrl');

        if (!hasCustomerName) {
          throw new Error(
            'Template must include {{customerName}} or both {{firstName}} and {{lastName}}'
          );
        }
        if (!hasBusinessName) {
          throw new Error('Template must include {{businessName}}');
        }
        if (!hasReviewUrl) {
          throw new Error('Template must include {{reviewUrl}}');
        }
      }

      return true;
    },
    {
      message: 'Template validation failed',
    }
  );

// Template query validation
export const templateQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: TemplateCategoryEnum.optional(),
  channel: RequestChannelEnum.optional(),
  templateType: z.enum(['system', 'business', 'all']).default('all'),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['name', 'category', 'usageCount', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Template preview validation
export const templatePreviewSchema = z.object({
  content: z.string().min(1).max(1600),
  subject: z.string().max(200).optional(),
  channel: RequestChannelEnum,
  sampleData: z
    .object({
      customerName: z.string().optional(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      businessName: z.string(),
      website: z.string().url().optional(),
      reviewUrl: z.string().url(),
    })
    .optional(),
});

// Query parameter validation schemas
export const reviewRequestQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: RequestStatusEnum.optional(),
  channel: RequestChannelEnum.optional(),
  customerId: customerIdSchema.optional(),
  scheduledAfter: z.string().datetime().optional(),
  scheduledBefore: z.string().datetime().optional(),
  sortBy: z.enum(['createdAt', 'scheduledFor', 'sentAt', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Multi-tenant validation helpers
export const businessScopedSchema = <T extends z.ZodType>(schema: T) => {
  return z.object({
    businessId: businessIdSchema,
    data: schema,
  });
};

export const validateBusinessScope = (businessId: string, userBusinessId: string) => {
  if (businessId !== userBusinessId) {
    throw new Error('Access denied: Resource belongs to different business');
  }
};

// Webhook validation schemas
export const twilioWebhookSchema = z.object({
  MessageSid: z.string(),
  MessageStatus: z.enum(['queued', 'sent', 'delivered', 'failed', 'undelivered']),
  To: z.string(),
  From: z.string(),
  Body: z.string().optional(),
  ErrorCode: z.string().optional(),
  ErrorMessage: z.string().optional(),
});

export const sendgridWebhookSchema = z.array(
  z.object({
    email: z.string().email(),
    timestamp: z.number().int(),
    event: z.enum([
      'processed',
      'deferred',
      'delivered',
      'bounce',
      'open',
      'click',
      'spamreport',
      'unsubscribe',
      'group_unsubscribe',
      'group_resubscribe',
    ]),
    sg_message_id: z.string(),
    reason: z.string().optional(),
    status: z.string().optional(),
    response: z.string().optional(),
    url: z.string().url().optional(),
    useragent: z.string().optional(),
    ip: z.string().optional(),
  })
);

// Type exports
export type CreateReviewRequestInput = z.infer<typeof createReviewRequestSchema>;
export type UpdateReviewRequestInput = z.infer<typeof updateReviewRequestSchema>;
export type BulkCreateReviewRequestInput = z.infer<typeof bulkCreateReviewRequestSchema>;
export type CreateMessageTemplateInput = z.infer<typeof createMessageTemplateSchema>;
export type UpdateMessageTemplateInput = z.infer<typeof updateMessageTemplateSchema>;
export type ReviewRequestQuery = z.infer<typeof reviewRequestQuerySchema>;
export type TemplateQuery = z.infer<typeof templateQuerySchema>;
export type TemplatePreview = z.infer<typeof templatePreviewSchema>;

// Export validation helpers
export {
  requiredPersonalizationVariables,
  optionalPersonalizationVariables,
  allValidVariables,
  extractVariables,
};
export type TwilioWebhookPayload = z.infer<typeof twilioWebhookSchema>;
export type SendGridWebhookPayload = z.infer<typeof sendgridWebhookSchema>;
