import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getBusinessContext } from '@/lib/auth-context';
import type { ApiSuccessResponse, ApiErrorResponse } from '@/types/api';
import { createBusinessScope, withBusinessScopedTransaction } from '@/lib/db/businessScoped';
import {
  createReviewRequestSchema,
  bulkCreateReviewRequestSchema,
  reviewRequestQuerySchema,
} from '@/lib/validators/reviewRequest';
import { sendGridService, renderMessage, createPersonalizationData } from '@/services/messaging';
// MVP: Skip worker initialization - using direct API calls
// import { ensureWorkersInitialized } from '@/lib/initialize-workers';
import { addJobToQueue } from '@/services/job-queue';

// MVP: Initialize workers on first API request
// ensureWorkersInitialized();

// Business Logic Helper Functions

function generateTrackingData(): { trackingUuid: string; trackingUrl: string } {
  const trackingUuid = crypto.randomUUID();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const trackingUrl = `${baseUrl}/r/${trackingUuid}`;

  return { trackingUuid, trackingUrl };
}

// Template processing with customer data
function replaceVariables(template: string, customer: any, business: any): string {
  const variables: Record<string, string> = {
    // Customer variables - support both old and new format
    'customer.firstName': customer.firstName || '',
    'customer.lastName': customer.lastName || '',
    'customer.fullName': `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
    'customer.email': customer.email || '',
    'customer.phone': customer.phone || '',

    // New template variable format
    firstName: customer.firstName || '',
    lastName: customer.lastName || '',
    customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
    email: customer.email || '',
    phone: customer.phone || '',

    // Business variables - support both formats
    'business.name': business.name || '',
    'business.phone': business.phone || '',
    'business.email': business.email || '',
    'business.website': business.website || '',

    // New business variable format
    businessName: business.name || '',
    website: business.website || '',

    // System variables
    'review.url': business.googleReviewUrl || '',
    reviewUrl: business.googleReviewUrl || '',
    'unsubscribe.url': `${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe`,
  };

  let processedTemplate = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    processedTemplate = processedTemplate.replace(regex, value);
  }

  // Variable replacement processing

  return processedTemplate;
}

// Send email via SendGrid (async helper function)
async function sendEmailViaProvider(
  reviewRequest: any,
  customer: any,
  business: any
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    if (reviewRequest.channel !== 'EMAIL') {
      return { success: true }; // Not an email, skip
    }

    // Create personalization data for rendering
    const personalizationData = createPersonalizationData(
      customer,
      business,
      reviewRequest.reviewUrl,
      reviewRequest.trackingUrl,
      reviewRequest.trackingUuid
    );

    // Render the message using existing template system
    const renderResult = await renderMessage(
      {
        content: reviewRequest.messageContent,
        subject: reviewRequest.subject || 'Share your experience with us',
      },
      personalizationData,
      'EMAIL'
    );

    if (!renderResult.success) {
      console.error('❌ Message rendering failed:', renderResult.error);
      return { success: false, error: renderResult.error };
    }

    // Send via SendGrid
    const emailResult = await sendGridService.sendReviewRequestEmail(
      customer.email,
      `${customer.firstName} ${customer.lastName}`.trim(),
      renderResult.data,
      business.id,
      reviewRequest.id
    );

    if (emailResult.success) {
      // Email sent successfully
      return {
        success: true,
        messageId: emailResult.messageId,
      };
    } else {
      console.error('❌ Email sending failed:', emailResult.error);
      return {
        success: false,
        error: emailResult.error,
      };
    }
  } catch (error) {
    console.error('❌ Email provider error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown email provider error',
    };
  }
}

// Enhanced Campaign Creation Schema
const createCampaignSchema = z.object({
  // Campaign metadata
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),

  // Message content
  templateId: z.string().optional(),
  customMessage: z.string().min(1).max(1600).optional(),
  customSubject: z.string().max(200).optional(),
  channel: z.enum(['SMS', 'EMAIL']),

  // Recipients
  customerIds: z.array(z.string()).min(1).max(1000),

  // Scheduling
  schedulingType: z.enum(['IMMEDIATE', 'SCHEDULED', 'OPTIMAL']).default('IMMEDIATE'),
  scheduledFor: z.string().datetime().optional(),

  // Follow-up configuration
  followUpEnabled: z.boolean().default(false),
  followUpSettings: z
    .object({
      maxAttempts: z.number().int().min(1).max(10).default(1),
      delayDays: z.array(z.number().int().min(1).max(30)).optional(),
      stopOnResponse: z.boolean().default(true),
    })
    .optional(),

  // Advanced settings
  respectBusinessHours: z.boolean().default(true),
  suppressionListCheck: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    // Get business context from authenticated user
    let businessId: string;
    try {
      const context = await getBusinessContext();
      businessId = context.businessId;
    } catch (error: any) {
      // Handle specific business context errors
      if (error.message?.includes('BUSINESS_NOT_FOUND')) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'BUSINESS_NOT_FOUND',
              message: 'No business found for this user. Please complete onboarding.',
            },
          } satisfies ApiErrorResponse,
          { status: 404 }
        );
      }
      throw error; // Re-throw other errors
    }

    // Parse and validate query parameters
    const url = new URL(request.url);
    const queryParams: any = {
      page: parseInt(url.searchParams.get('page') || '1'),
      limit: parseInt(url.searchParams.get('limit') || '20'),
      sortBy: url.searchParams.get('sortBy') || 'createdAt',
      sortOrder: url.searchParams.get('sortOrder') || 'desc',
    };

    // Only add optional parameters if they have values
    const status = url.searchParams.get('status');
    const channel = url.searchParams.get('channel');
    const customerId = url.searchParams.get('customerId');
    const scheduledAfter = url.searchParams.get('scheduledAfter');
    const scheduledBefore = url.searchParams.get('scheduledBefore');

    if (status) queryParams.status = status;
    if (channel) queryParams.channel = channel;
    if (customerId) queryParams.customerId = customerId;
    if (scheduledAfter) queryParams.scheduledAfter = scheduledAfter;
    if (scheduledBefore) queryParams.scheduledBefore = scheduledBefore;

    const query = reviewRequestQuerySchema.parse(queryParams);

    // Use business-scoped query
    const businessScope = createBusinessScope(businessId);

    // Build where clause
    const where: any = {
      isActive: true,
    };

    if (query.status) where.status = query.status;
    if (query.channel) where.channel = query.channel;
    if (query.customerId) where.customerId = query.customerId;

    if (query.scheduledAfter || query.scheduledBefore) {
      where.scheduledFor = {};
      if (query.scheduledAfter) where.scheduledFor.gte = new Date(query.scheduledAfter);
      if (query.scheduledBefore) where.scheduledFor.lte = new Date(query.scheduledBefore);
    }

    // Build order clause
    const orderBy: any = {};
    orderBy[query.sortBy] = query.sortOrder;

    const [requests, totalCount] = await Promise.all([
      businessScope.findManyReviewRequests({
        where,
        orderBy: [orderBy],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          template: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
          events: {
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: {
              type: true,
              description: true,
              createdAt: true,
            },
          },
        },
      }),
      businessScope.countReviewRequests(where),
    ]);

    const totalPages = Math.ceil(totalCount / query.limit);
    const hasNextPage = query.page < totalPages;
    const hasPrevPage = query.page > 1;

    const response: ApiSuccessResponse<typeof requests> = {
      success: true,
      data: requests,
      meta: {
        pagination: {
          page: query.page,
          limit: query.limit,
          totalCount,
          totalPages,
          hasNextPage,
          hasPrevPage,
        },
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching review requests:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: error.errors,
          },
        } satisfies ApiErrorResponse,
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch review requests' },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Starting review request processing
    console.log('📡 Request headers:', Object.fromEntries(request.headers.entries()));

    // Get business context from authenticated user
    const context = await getBusinessContext();
    const businessId = context.businessId;
    console.log('🏢 Business context:', { businessId });

    // Get business with all necessary data
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        website: true,
        googleReviewUrl: true,
      },
    });

    if (!business) {
      console.error('❌ Business not found:', businessId);
      return NextResponse.json(
        {
          success: false,
          error: { code: 'BUSINESS_NOT_FOUND', message: 'Business not found' },
        } satisfies ApiErrorResponse,
        { status: 404 }
      );
    }

    console.log('🏢 Business found:', {
      id: business.id,
      name: business.name,
      hasGoogleReviewUrl: !!business.googleReviewUrl,
    });

    const body = await request.json();
    console.log('📝 Request body received:', {
      hasName: !!body.name,
      hasCustomerIds: !!body.customerIds,
      customerIdsCount: Array.isArray(body.customerIds) ? body.customerIds.length : 'not-array',
      hasCustomerId: !!body.customerId,
      channel: body.channel,
      hasMessageContent: !!body.messageContent,
      hasReviewUrl: !!body.reviewUrl,
      hasScheduledFor: !!body.scheduledFor,
      scheduledForValue: body.scheduledFor,
      scheduledForType: typeof body.scheduledFor,
      hasTemplateId: !!body.templateId,
      templateId: body.templateId,
      bodyKeys: Object.keys(body),
      fullBodySample: JSON.stringify(body).substring(0, 500) + '...',
    });

    // Determine request type based on payload structure
    if (body.name && body.customerIds && Array.isArray(body.customerIds)) {
      console.log('📋 Processing as CAMPAIGN creation (has name + customerIds)');
      return await createCampaign(business, body);
    } else if (body.customerIds && Array.isArray(body.customerIds) && body.customerIds.length > 1) {
      console.log(
        '📋 Processing as BULK review request creation (multiple customerIds, no campaign)'
      );
      return await createBulkReviewRequests(business, body);
    } else if (
      body.customerId ||
      (body.customerIds && Array.isArray(body.customerIds) && body.customerIds.length === 1)
    ) {
      console.log('📋 Processing as SINGLE review request creation');
      return await createSingleRequest(business, body);
    } else {
      console.error('❌ Invalid request format - unclear intent');
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST_FORMAT',
            message: 'Request format is unclear - missing required fields',
          },
        } satisfies ApiErrorResponse,
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('❌ Error creating review request:', error);
    console.error('❌ Error stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('❌ Error type:', error?.constructor?.name);

    if (error instanceof z.ZodError) {
      console.error('❌ Validation error details:', JSON.stringify(error.errors, null, 2));
      error.errors.forEach((err, index) => {
        console.error(`❌ Validation error ${index + 1}:`, {
          path: err.path,
          code: err.code,
          message: err.message,
          received: err.received,
          expected: err.expected,
        });
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
        } satisfies ApiErrorResponse,
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Unexpected error details:', {
      message: errorMessage,
      name: error instanceof Error ? error.name : 'Unknown',
      cause: error instanceof Error ? error.cause : 'No cause',
    });

    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: errorMessage },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}

// Enhanced Campaign Creation Function
async function createCampaign(business: any, body: any) {
  const campaignData = createCampaignSchema.parse(body);
  const businessScope = createBusinessScope(business.id);

  // Validate customers exist and belong to this business
  console.log('🔍 Validating campaign customers:', {
    requestedCustomerIds: campaignData.customerIds,
    businessId: business.id,
    customerCount: campaignData.customerIds.length,
  });

  const customers = await businessScope.findManyCustomers({
    where: {
      id: { in: campaignData.customerIds },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  });

  console.log('🔍 Campaign customer validation results:', {
    requestedCustomerIds: campaignData.customerIds,
    foundCustomerIds: customers.map(c => c.id),
    requestedCount: campaignData.customerIds.length,
    foundCount: customers.length,
    missingCustomerIds: campaignData.customerIds.filter(id => !customers.some(c => c.id === id)),
    businessId: business.id,
  });

  if (customers.length !== campaignData.customerIds.length) {
    const missingIds = campaignData.customerIds.filter(id => !customers.some(c => c.id === id));
    console.error('❌ Campaign customer validation failed:', {
      requestedCustomerIds: campaignData.customerIds,
      foundCustomerIds: customers.map(c => c.id),
      missingCustomerIds: missingIds,
      businessId: business.id,
      errorType: 'FOREIGN_KEY_CONSTRAINT_CUSTOMER',
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_CUSTOMERS',
          message: 'Some customers not found or not accessible',
          details: { missingIds },
        },
      } satisfies ApiErrorResponse,
      { status: 400 }
    );
  }

  // Check suppression list if enabled
  const suppressedContacts: string[] = [];
  if (campaignData.suppressionListCheck) {
    for (const customer of customers) {
      const contactInfo = campaignData.channel === 'SMS' ? customer.phone : customer.email;
      if (contactInfo) {
        const isSuppressed = await businessScope.isContactSuppressed(
          contactInfo,
          campaignData.channel
        );
        if (isSuppressed) {
          suppressedContacts.push(`${customer.firstName} ${customer.lastName} (${contactInfo})`);
        }
      }
    }
  }

  if (suppressedContacts.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SUPPRESSED_CONTACTS',
          message: 'Some contacts are suppressed',
          details: { suppressedContacts },
        },
      } satisfies ApiErrorResponse,
      { status: 400 }
    );
  }

  // Create campaign and requests in transaction
  let result;
  try {
    result = await withBusinessScopedTransaction(business.id, async scope => {
      // Get template if specified (inside transaction)
      let template = null;
      if (campaignData.templateId) {
        console.log('🔍 Validating campaign template:', {
          templateId: campaignData.templateId,
          businessId: business.id,
        });

        const templates = await scope.findManyMessageTemplates({
          where: {
            id: campaignData.templateId,
            OR: [
              { businessId: business.id }, // Business-specific templates
              { businessId: null, templateType: 'system' }, // System templates
            ],
          },
          take: 1,
        });
        template = templates[0] || null;

        console.log('🔍 Campaign template validation results:', {
          templateId: campaignData.templateId,
          templateFound: !!template,
          templateName: template?.name,
          businessId: business.id,
        });

        if (!template) {
          console.error('❌ Campaign template validation failed:', {
            templateId: campaignData.templateId,
            businessId: business.id,
            errorType: 'FOREIGN_KEY_CONSTRAINT_TEMPLATE',
          });
          throw new Error(
            `Template with ID ${campaignData.templateId} not found or not accessible`
          );
        }
      }

      // Determine final message content
      const finalMessage = campaignData.customMessage || template?.content || '';
      const finalSubject = campaignData.customSubject || template?.subject || undefined;

      if (!finalMessage.trim()) {
        throw new Error('Message content is required');
      }

      // Determine scheduling
      let scheduledDateTime: Date | null = null;
      if (campaignData.schedulingType === 'SCHEDULED' && campaignData.scheduledFor) {
        scheduledDateTime = new Date(campaignData.scheduledFor);
      } else if (campaignData.schedulingType === 'OPTIMAL') {
        // Simple optimal timing: next Tuesday at 2 PM
        const optimalTime = new Date();
        const daysUntilTuesday = (2 - optimalTime.getDay() + 7) % 7;
        optimalTime.setDate(
          optimalTime.getDate() + (daysUntilTuesday === 0 ? 7 : daysUntilTuesday)
        );
        optimalTime.setHours(14, 0, 0, 0);
        scheduledDateTime = optimalTime;
      }
      // Create campaign
      const campaign = await scope.createCampaign({
        name: campaignData.name,
        description: campaignData.description,
        channel: campaignData.channel,
        schedulingType: campaignData.schedulingType,
        scheduledFor: scheduledDateTime,
        followUpEnabled: campaignData.followUpEnabled,
        followUpSettings: campaignData.followUpSettings,
        targetCustomerIds: campaignData.customerIds,
        totalCustomers: customers.length,
        template: template ? { connect: { id: template.id } } : undefined,
      });

      // Create review requests
      const reviewRequests = [];
      const errors: string[] = [];

      for (const customer of customers) {
        try {
          // Personalize message for this customer
          const personalizedMessage = replaceVariables(finalMessage, customer, business);
          const personalizedSubject = finalSubject
            ? replaceVariables(finalSubject, customer, business)
            : undefined;

          // Generate tracking data
          const { trackingUuid, trackingUrl } = generateTrackingData();

          const reviewRequest = await scope.createReviewRequest({
            customer: { connect: { id: customer.id } },
            campaign: { connect: { id: campaign.id } },
            template: template ? { connect: { id: template.id } } : undefined,
            channel: campaignData.channel,
            subject: personalizedSubject,
            messageContent: finalMessage,
            personalizedMessage,
            reviewUrl: business.googleReviewUrl || 'https://g.page/your-business/review',
            trackingUrl,
            trackingUuid,
            scheduledFor: scheduledDateTime,
            status: scheduledDateTime ? 'QUEUED' : 'QUEUED',
          });

          reviewRequests.push(reviewRequest);

          // Handle email sending based on scheduling
          if (campaignData.channel === 'EMAIL') {
            if (!scheduledDateTime) {
              // Send immediately
              try {
                const emailResult = await sendEmailViaProvider(reviewRequest, customer, business);
                if (emailResult.success) {
                  console.log('✅ Campaign email sent immediately:', {
                    requestId: reviewRequest.id,
                    messageId: emailResult.messageId,
                    customerEmail: customer.email,
                  });

                  // Update request with email delivery info
                  await scope.updateReviewRequest(reviewRequest.id, {
                    status: 'SENT',
                    sentAt: new Date(),
                    externalId: emailResult.messageId,
                  });
                } else {
                  console.error('❌ Campaign email failed:', emailResult.error);
                  await scope.updateReviewRequest(reviewRequest.id, {
                    status: 'FAILED',
                    errorMessage: emailResult.error,
                  });
                }
              } catch (emailError) {
                console.error('❌ Campaign email exception:', emailError);
              }
            } else {
              // Queue for scheduled delivery
              try {
                await addJobToQueue(
                  'send-request',
                  {
                    requestId: reviewRequest.id,
                    retryCount: 0,
                  },
                  {
                    delay: scheduledDateTime.getTime() - Date.now(),
                    priority: 5,
                  }
                );

                console.log('✅ Campaign email queued for scheduled delivery:', {
                  requestId: reviewRequest.id,
                  scheduledFor: scheduledDateTime.toISOString(),
                  customerEmail: customer.email,
                });
              } catch (queueError) {
                console.error('❌ Failed to queue scheduled email:', queueError);
              }
            }
          }

          // Log creation event
          await scope.createEvent({
            type: 'REQUEST_CREATED',
            source: 'system',
            description: `Review request created for ${customer.firstName} ${customer.lastName}`,
            reviewRequest: { connect: { id: reviewRequest.id } },
            metadata: {
              channel: campaignData.channel,
              scheduledFor: scheduledDateTime,
              campaignId: campaign.id,
            },
          });
        } catch (error) {
          errors.push(
            `Failed to create request for ${customer.firstName} ${customer.lastName}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      // Update campaign with actual results
      await scope.updateCampaign(campaign.id, {
        successfulRequests: reviewRequests.length,
        failedRequests: errors.length,
        status: reviewRequests.length > 0 ? 'active' : 'failed',
        launchedAt: new Date(),
      });

      // Log campaign creation event
      await scope.createEvent({
        type: 'CAMPAIGN_CREATED',
        source: 'system',
        description: `Campaign "${campaign.name}" created with ${reviewRequests.length} requests`,
        metadata: {
          campaignId: campaign.id,
          totalRequests: customers.length,
          successfulRequests: reviewRequests.length,
          failedRequests: errors.length,
        },
      });

      return {
        campaign,
        requests: reviewRequests,
        totalRequests: customers.length,
        successfulRequests: reviewRequests.length,
        failedRequests: errors.length,
        errors,
      };
    });
  } catch (error) {
    console.error('Transaction failed:', error);

    if (error instanceof Error && error.message === 'Message content is required') {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MISSING_MESSAGE', message: 'Message content is required' },
        } satisfies ApiErrorResponse,
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: { code: 'CAMPAIGN_CREATION_FAILED', message: 'Failed to create campaign' },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }

  const response: ApiSuccessResponse<typeof result> = {
    success: true,
    data: result,
  };

  return NextResponse.json(response, { status: 201 });
}

// Bulk Review Request Creation (No Campaign)
async function createBulkReviewRequests(business: any, body: any) {
  console.log('🚀 Starting bulk review request creation');

  // Declare requestData outside try-catch to fix scope issue
  let requestData: any;

  try {
    console.log('📋 Pre-validation body analysis:', {
      bodyType: typeof body,
      isObject: body && typeof body === 'object',
      hasScheduledFor: 'scheduledFor' in body,
      scheduledForValue: body.scheduledFor,
      scheduledForType: typeof body.scheduledFor,
      rawBody: JSON.stringify(body, null, 2),
    });

    requestData = bulkCreateReviewRequestSchema.parse(body);

    console.log('✅ Bulk request data validated successfully:', {
      customerCount: requestData.customerIds.length,
      channel: requestData.channel,
      hasSubject: !!requestData.subject,
      messageLength: requestData.messageContent.length,
      hasScheduling: !!requestData.scheduledFor,
      scheduledForValue: requestData.scheduledFor,
      scheduledForType: typeof requestData.scheduledFor,
      templateId: requestData.templateId,
      reviewUrl: requestData.reviewUrl,
      metadata: requestData.metadata,
    });
  } catch (validationError) {
    console.error('❌ Bulk validation failed:', validationError);
    if (validationError instanceof z.ZodError) {
      console.error('❌ Bulk validation errors:', JSON.stringify(validationError.errors, null, 2));
      validationError.errors.forEach((err, index) => {
        console.error(`❌ Bulk validation error ${index + 1}:`, {
          path: err.path.join('.'),
          code: err.code,
          message: err.message,
          received: err.received,
          expected: err.expected,
        });
      });
    }
    throw validationError;
  }

  const businessScope = createBusinessScope(business.id);

  // Validate customers exist and belong to this business
  console.log('🔍 Validating bulk customers:', {
    requestedCustomerIds: requestData.customerIds,
    businessId: business.id,
    customerCount: requestData.customerIds.length,
  });

  const customers = await businessScope.findManyCustomers({
    where: {
      id: { in: requestData.customerIds },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  });

  console.log('🔍 Bulk customer validation results:', {
    requestedCustomerIds: requestData.customerIds,
    foundCustomerIds: customers.map(c => c.id),
    requestedCount: requestData.customerIds.length,
    foundCount: customers.length,
    missingCustomerIds: requestData.customerIds.filter(id => !customers.some(c => c.id === id)),
    businessId: business.id,
  });

  if (customers.length !== requestData.customerIds.length) {
    const missingIds = requestData.customerIds.filter(id => !customers.some(c => c.id === id));
    console.error('❌ Bulk customer validation failed:', {
      requestedCustomerIds: requestData.customerIds,
      foundCustomerIds: customers.map(c => c.id),
      missingCustomerIds: missingIds,
      businessId: business.id,
      errorType: 'FOREIGN_KEY_CONSTRAINT_CUSTOMER',
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_CUSTOMERS',
          message: 'Some customers not found or not accessible',
          details: { missingIds },
        },
      } satisfies ApiErrorResponse,
      { status: 400 }
    );
  }

  // Process all review requests
  const reviewRequests = [];
  const errors: string[] = [];

  console.log('📋 Processing review requests for', customers.length, 'customers');

  try {
    const result = await withBusinessScopedTransaction(business.id, async scope => {
      for (const customer of customers) {
        try {
          // Personalize message for this customer
          const personalizedMessage = replaceVariables(
            requestData.messageContent,
            customer,
            business
          );
          const personalizedSubject = requestData.subject
            ? replaceVariables(requestData.subject, customer, business)
            : undefined;

          console.log('📝 Processing request for customer:', {
            customerId: customer.id,
            customerName: `${customer.firstName} ${customer.lastName}`,
            personalizedLength: personalizedMessage.length,
          });

          // Generate tracking data
          const { trackingUuid, trackingUrl } = generateTrackingData();

          // Determine scheduling with detailed logging
          let scheduledDateTime: Date | null = null;
          if (requestData.scheduledFor) {
            console.log('📅 Processing scheduling:', {
              originalValue: requestData.scheduledFor,
              type: typeof requestData.scheduledFor,
              isString: typeof requestData.scheduledFor === 'string',
              isDate: requestData.scheduledFor instanceof Date,
            });

            try {
              scheduledDateTime = new Date(requestData.scheduledFor);
              console.log('📅 Scheduling processed:', {
                scheduledDateTime: scheduledDateTime.toISOString(),
                isValid: !isNaN(scheduledDateTime.getTime()),
                timestamp: scheduledDateTime.getTime(),
              });

              if (isNaN(scheduledDateTime.getTime())) {
                console.error('❌ Invalid date created from:', requestData.scheduledFor);
                scheduledDateTime = null;
              }
            } catch (dateError) {
              console.error('❌ Date creation error:', dateError);
              scheduledDateTime = null;
            }
          } else {
            console.log('📅 No scheduling requested (scheduledFor is falsy)');
          }

          // Build the review request data
          const reviewRequestData: any = {
            customer: { connect: { id: customer.id } },
            channel: requestData.channel,
            subject: personalizedSubject,
            messageContent: requestData.messageContent,
            personalizedMessage,
            reviewUrl: requestData.reviewUrl,
            trackingUrl,
            trackingUuid,
            scheduledFor: scheduledDateTime,
            status: 'QUEUED',
          };

          // Validate and add template connection if templateId is provided
          if (requestData.templateId) {
            console.log('🔍 Validating bulk template for customer:', {
              templateId: requestData.templateId,
              customerId: customer.id,
              businessId: business.id,
            });

            // Verify template exists (business-specific or system template)
            const templateExists = await scope.findManyMessageTemplates({
              where: {
                id: requestData.templateId,
                OR: [
                  { businessId: business.id }, // Business-specific templates
                  { businessId: null, templateType: 'system' }, // System templates
                ],
              },
              take: 1,
            });

            console.log('🔍 Bulk template validation results:', {
              templateId: requestData.templateId,
              templateFound: templateExists.length > 0,
              templateName: templateExists[0]?.name,
              customerId: customer.id,
              businessId: business.id,
            });

            if (templateExists.length === 0) {
              console.error('❌ Bulk template validation failed:', {
                templateId: requestData.templateId,
                customerId: customer.id,
                businessId: business.id,
                errorType: 'FOREIGN_KEY_CONSTRAINT_TEMPLATE',
              });
              throw new Error(
                `Template with ID ${requestData.templateId} not found or not accessible for customer ${customer.firstName} ${customer.lastName}`
              );
            }

            reviewRequestData.template = { connect: { id: requestData.templateId } };
          }

          const reviewRequest = await scope.createReviewRequest(reviewRequestData);

          reviewRequests.push({
            id: reviewRequest.id,
            channel: reviewRequest.channel,
            status: reviewRequest.status,
            subject: reviewRequest.subject,
            reviewUrl: reviewRequest.reviewUrl,
            trackingUuid: reviewRequest.trackingUuid,
            scheduledFor: reviewRequest.scheduledFor,
            createdAt: reviewRequest.createdAt,
            customer: {
              id: customer.id,
              firstName: customer.firstName,
              lastName: customer.lastName,
              email: customer.email,
              phone: customer.phone,
            },
          });

          console.log('✅ Review request created:', {
            requestId: reviewRequest.id,
            customerId: customer.id,
            status: reviewRequest.status,
          });

          // Handle email sending based on scheduling
          if (requestData.channel === 'EMAIL') {
            if (!scheduledDateTime) {
              // Send immediately
              try {
                const emailResult = await sendEmailViaProvider(reviewRequest, customer, business);
                if (emailResult.success) {
                  console.log('✅ Bulk email sent immediately:', {
                    requestId: reviewRequest.id,
                    messageId: emailResult.messageId,
                    customerEmail: customer.email,
                  });

                  // Update request with email delivery info
                  await scope.updateReviewRequest(reviewRequest.id, {
                    status: 'SENT',
                    sentAt: new Date(),
                    externalId: emailResult.messageId,
                  });

                  // Update the status in the returned data
                  const requestIndex = reviewRequests.findIndex(r => r.id === reviewRequest.id);
                  if (requestIndex >= 0) {
                    reviewRequests[requestIndex].status = 'SENT';
                  }
                } else {
                  console.error('❌ Bulk email failed:', emailResult.error);
                  await scope.updateReviewRequest(reviewRequest.id, {
                    status: 'FAILED',
                    errorMessage: emailResult.error,
                  });

                  // Update the status in the returned data
                  const requestIndex = reviewRequests.findIndex(r => r.id === reviewRequest.id);
                  if (requestIndex >= 0) {
                    reviewRequests[requestIndex].status = 'FAILED';
                  }
                }
              } catch (emailError) {
                console.error('❌ Bulk email exception:', emailError);
              }
            } else {
              // Queue for scheduled delivery
              try {
                await addJobToQueue(
                  'send-request',
                  {
                    requestId: reviewRequest.id,
                    retryCount: 0,
                  },
                  {
                    delay: scheduledDateTime.getTime() - Date.now(),
                    priority: 5,
                  }
                );

                console.log('✅ Bulk email queued for scheduled delivery:', {
                  requestId: reviewRequest.id,
                  scheduledFor: scheduledDateTime.toISOString(),
                  customerEmail: customer.email,
                });
              } catch (queueError) {
                console.error('❌ Failed to queue scheduled email:', queueError);
              }
            }
          }

          // Log creation event
          await scope.createEvent({
            type: 'REQUEST_CREATED',
            source: 'system',
            description: `Review request created for ${customer.firstName} ${customer.lastName}`,
            reviewRequest: { connect: { id: reviewRequest.id } },
            metadata: {
              channel: requestData.channel,
              scheduledFor: scheduledDateTime,
              creationType: 'bulk',
            },
          });
        } catch (error) {
          const errorMessage = `Failed to create request for ${customer.firstName} ${customer.lastName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error('❌ Individual request creation failed:', errorMessage);
          errors.push(errorMessage);
        }
      }

      return {
        requests: reviewRequests,
        totalRequests: customers.length,
        successfulRequests: reviewRequests.length,
        failedRequests: errors.length,
        errors,
      };
    });

    console.log('✅ Bulk creation completed:', {
      totalRequests: result.totalRequests,
      successful: result.successfulRequests,
      failed: result.failedRequests,
    });

    const response: ApiSuccessResponse<typeof result> = {
      success: true,
      data: result,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('❌ Bulk creation transaction failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: { code: 'BULK_CREATION_FAILED', message: 'Failed to create bulk review requests' },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}

// Simple Single Request Creation (Backward Compatibility)
async function createSingleRequest(business: any, body: any) {
  console.log('🚀 Starting single review request creation');

  try {
    console.log('📋 Single request pre-processing:', {
      bodyKeys: Object.keys(body),
      hasCustomerId: !!body.customerId,
      hasCustomerIds: !!body.customerIds,
      customerIdsArray: Array.isArray(body.customerIds),
      customerIdsLength: Array.isArray(body.customerIds) ? body.customerIds.length : 'N/A',
      hasScheduledFor: 'scheduledFor' in body,
      scheduledForValue: body.scheduledFor,
      scheduledForType: typeof body.scheduledFor,
    });

    // Handle both old format (customerId) and new format (single customerIds array)
    let requestData;
    if (body.customerIds && Array.isArray(body.customerIds) && body.customerIds.length === 1) {
      // Convert from bulk format with single customer to single format
      console.log('🔄 Converting from bulk format to single format');
      requestData = {
        customerId: body.customerIds[0],
        templateId: body.templateId,
        channel: body.channel,
        subject: body.subject,
        messageContent: body.messageContent,
        reviewUrl: body.reviewUrl,
        scheduledFor: body.scheduledFor,
        metadata: body.metadata,
      };
    } else {
      requestData = body;
    }

    console.log('📝 Single request data prepared:', {
      customerId: requestData.customerId,
      channel: requestData.channel,
      messageLength: requestData.messageContent?.length,
      hasSubject: !!requestData.subject,
      hasScheduledFor: 'scheduledFor' in requestData,
      scheduledForValue: requestData.scheduledFor,
      scheduledForType: typeof requestData.scheduledFor,
    });

    let validatedData;
    try {
      console.log('📋 Validating single request data...');
      validatedData = createReviewRequestSchema.parse(requestData);
      console.log('✅ Single request validation successful:', {
        customerId: validatedData.customerId,
        channel: validatedData.channel,
        hasScheduledFor: !!validatedData.scheduledFor,
        scheduledForValue: validatedData.scheduledFor,
        scheduledForType: typeof validatedData.scheduledFor,
      });
    } catch (validationError) {
      console.error('❌ Single request validation failed:', validationError);
      if (validationError instanceof z.ZodError) {
        console.error(
          '❌ Single validation errors:',
          JSON.stringify(validationError.errors, null, 2)
        );
        validationError.errors.forEach((err, index) => {
          console.error(`❌ Single validation error ${index + 1}:`, {
            path: err.path.join('.'),
            code: err.code,
            message: err.message,
            received: err.received,
            expected: err.expected,
          });
        });
      }
      throw validationError;
    }
    const { trackingUuid, trackingUrl } = generateTrackingData();

    console.log('📋 Creating single review request in database');

    // Validate customer exists and belongs to this business
    console.log('🔍 Validating single customer:', {
      customerId: validatedData.customerId,
      businessId: business.id,
    });

    const customerExists = await prisma.customer.findFirst({
      where: {
        id: validatedData.customerId,
        businessId: business.id,
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    });

    console.log('🔍 Single customer validation results:', {
      customerId: validatedData.customerId,
      customerFound: !!customerExists,
      customerName: customerExists
        ? `${customerExists.firstName} ${customerExists.lastName}`
        : null,
      businessId: business.id,
    });

    if (!customerExists) {
      console.error('❌ Single customer validation failed:', {
        customerId: validatedData.customerId,
        businessId: business.id,
        errorType: 'FOREIGN_KEY_CONSTRAINT_CUSTOMER',
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_CUSTOMER',
            message: 'Customer not found or not accessible',
            details: { customerId: validatedData.customerId },
          },
        } satisfies ApiErrorResponse,
        { status: 400 }
      );
    }

    // Validate template if provided
    let templateData = null;
    if (validatedData.templateId) {
      console.log('🔍 Validating single template:', {
        templateId: validatedData.templateId,
        businessId: business.id,
      });

      templateData = await prisma.messageTemplate.findFirst({
        where: {
          id: validatedData.templateId,
          OR: [
            { businessId: business.id }, // Business-specific templates
            { businessId: null, templateType: 'system' }, // System templates
          ],
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          content: true,
          subject: true,
        },
      });

      console.log('🔍 Single template validation results:', {
        templateId: validatedData.templateId,
        templateFound: !!templateData,
        templateName: templateData?.name,
        businessId: business.id,
      });

      if (!templateData) {
        console.error('❌ Single template validation failed:', {
          templateId: validatedData.templateId,
          businessId: business.id,
          errorType: 'FOREIGN_KEY_CONSTRAINT_TEMPLATE',
        });
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_TEMPLATE',
              message: 'Template not found or not accessible',
              details: { templateId: validatedData.templateId },
            },
          } satisfies ApiErrorResponse,
          { status: 400 }
        );
      }
    }

    // Build the create data
    const createData: any = {
      businessId: business.id,
      customerId: validatedData.customerId,
      templateId: validatedData.templateId || null, // Include templateId in create data
      channel: validatedData.channel,
      subject: validatedData.subject,
      messageContent: validatedData.messageContent,
      reviewUrl: validatedData.reviewUrl,
      trackingUrl,
      trackingUuid,
      scheduledFor: (() => {
        if (!validatedData.scheduledFor) {
          console.log('📅 No scheduling for single request');
          return null;
        }

        console.log('📅 Processing single request scheduling:', {
          originalValue: validatedData.scheduledFor,
          type: typeof validatedData.scheduledFor,
        });

        try {
          const scheduledDate = new Date(validatedData.scheduledFor);
          console.log('📅 Single request scheduling result:', {
            scheduledDate: scheduledDate.toISOString(),
            isValid: !isNaN(scheduledDate.getTime()),
          });
          return !isNaN(scheduledDate.getTime()) ? scheduledDate : null;
        } catch (dateError) {
          console.error('❌ Single request date error:', dateError);
          return null;
        }
      })(),
      status: 'QUEUED',
      metadata: validatedData.metadata || {},
    };

    // Add template reference if provided
    if (validatedData.templateId) {
      createData.templateId = validatedData.templateId;
    }

    console.log('📝 Single request create data:', {
      businessId: createData.businessId,
      customerId: createData.customerId,
      channel: createData.channel,
      hasTemplateId: !!createData.templateId,
      templateId: createData.templateId,
    });

    const reviewRequest = await prisma.reviewRequest.create({
      data: createData,
      select: {
        id: true,
        channel: true,
        status: true,
        subject: true,
        reviewUrl: true,
        trackingUuid: true,
        scheduledFor: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    console.log('✅ Single review request created successfully:', {
      id: reviewRequest.id,
      customerId: reviewRequest.customer.id,
      status: reviewRequest.status,
    });

    // Handle email sending based on scheduling
    let finalStatus = reviewRequest.status;
    if (validatedData.channel === 'EMAIL') {
      if (!createData.scheduledFor) {
        // Send immediately
        try {
          const emailResult = await sendEmailViaProvider(
            reviewRequest,
            reviewRequest.customer,
            business
          );
          if (emailResult.success) {
            console.log('✅ Single email sent immediately:', {
              requestId: reviewRequest.id,
              messageId: emailResult.messageId,
              customerEmail: reviewRequest.customer.email,
            });

            // Update request with email delivery info
            await prisma.reviewRequest.update({
              where: { id: reviewRequest.id },
              data: {
                status: 'SENT',
                sentAt: new Date(),
                externalId: emailResult.messageId,
              },
            });

            finalStatus = 'SENT';
          } else {
            console.error('❌ Single email failed:', emailResult.error);
            await prisma.reviewRequest.update({
              where: { id: reviewRequest.id },
              data: {
                status: 'FAILED',
                errorMessage: emailResult.error,
              },
            });

            finalStatus = 'FAILED';
          }
        } catch (emailError) {
          console.error('❌ Single email exception:', emailError);
        }
      } else {
        // Queue for scheduled delivery
        try {
          await addJobToQueue(
            'send-request',
            {
              requestId: reviewRequest.id,
              retryCount: 0,
            },
            {
              delay: createData.scheduledFor.getTime() - Date.now(),
              priority: 5,
            }
          );

          console.log('✅ Single email queued for scheduled delivery:', {
            requestId: reviewRequest.id,
            scheduledFor: createData.scheduledFor.toISOString(),
            customerEmail: reviewRequest.customer.email,
          });
        } catch (queueError) {
          console.error('❌ Failed to queue scheduled email:', queueError);
        }
      }
    }

    // Return in the same format as bulk creation for frontend consistency
    const response: ApiSuccessResponse<{
      requests: (typeof reviewRequest)[];
      totalRequests: number;
      successfulRequests: number;
      failedRequests: number;
      errors: string[];
    }> = {
      success: true,
      data: {
        requests: [{ ...reviewRequest, status: finalStatus }],
        totalRequests: 1,
        successfulRequests: 1,
        failedRequests: 0,
        errors: [],
      },
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('❌ Single request creation error:', error);

    if (error instanceof z.ZodError) {
      console.error('❌ Single request validation error:', error.errors);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid single request data',
            details: error.errors,
          },
        } satisfies ApiErrorResponse,
        { status: 400 }
      );
    }

    // Return detailed error for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Detailed single request error:', errorMessage);

    return NextResponse.json(
      {
        success: false,
        error: { code: 'SINGLE_REQUEST_FAILED', message: errorMessage },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}
