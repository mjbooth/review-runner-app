import type { RequestChannel, RequestStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { logger, loggers } from '../lib/logger';
import type { CreateReviewRequestInput, UpdateReviewRequestInput, Result } from '../types/database';
import { getContactForChannel, canSendToCustomer, generateTrackingUrl } from '../lib/utils';
import { checkSuppressions } from './suppressions';
import { addJobToQueue } from './job-queue';

export interface CreateReviewRequestParams {
  businessId: string;
  customerId: string;
  channel: RequestChannel;
  subject?: string;
  messageContent: string;
  reviewUrl: string;
  scheduledFor?: Date;
}

export interface BulkCreateReviewRequestParams {
  businessId: string;
  customerIds: string[];
  channel: RequestChannel;
  subject?: string;
  messageContent: string;
  reviewUrl: string;
  scheduledFor?: Date;
}

export interface ReviewRequestSummary {
  id: string;
  businessId: string;
  customerId: string;
  channel: RequestChannel;
  status: RequestStatus;
  trackingUuid: string;
  trackingUrl: string;
  scheduledFor: Date;
  createdAt: Date;
  customer: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
}

/**
 * Create a single review request with validation and suppression checking
 */
export async function createReviewRequest(
  params: CreateReviewRequestParams
): Promise<Result<ReviewRequestSummary>> {
  try {
    const { businessId, customerId, channel, subject, messageContent, reviewUrl, scheduledFor } =
      params;

    loggers.business.reviewRequestCreated({
      requestId: 'pending',
      businessId,
      customerId,
      channel,
    });

    // Verify customer exists and belongs to business
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        businessId,
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

    if (!customer) {
      return {
        success: false,
        error: 'Customer not found or inactive',
      };
    }

    // Validate customer has contact method for channel
    if (!canSendToCustomer(customer, channel)) {
      const contactType = channel === 'EMAIL' ? 'email address' : 'phone number';
      return {
        success: false,
        error: `Customer does not have a valid ${contactType}`,
      };
    }

    // Email requires subject
    if (channel === 'EMAIL' && !subject) {
      return {
        success: false,
        error: 'Subject is required for email requests',
      };
    }

    // Check suppressions
    const contact = getContactForChannel(customer, channel)!;
    const isSupPressed = await checkSuppressions(businessId, contact, channel);

    if (isSupPressed.success && isSupPressed.data.isSuppressed) {
      return {
        success: false,
        error: `Contact is suppressed: ${isSupPressed.data.reason}`,
      };
    }

    // Generate tracking UUID and URL
    const trackingUuid = uuidv4();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const trackingUrl = generateTrackingUrl(baseUrl, trackingUuid);

    // Create review request
    const reviewRequest = await prisma.$transaction(async tx => {
      const request = await tx.reviewRequest.create({
        data: {
          businessId,
          customerId,
          channel,
          subject,
          messageContent,
          reviewUrl,
          trackingUuid,
          trackingUrl,
          scheduledFor: scheduledFor || new Date(),
        },
        select: {
          id: true,
          businessId: true,
          customerId: true,
          channel: true,
          status: true,
          trackingUuid: true,
          trackingUrl: true,
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

      // Log creation event
      await tx.event.create({
        data: {
          businessId,
          reviewRequestId: request.id,
          type: 'REQUEST_CREATED',
          source: 'system',
          description: `Review request created for ${channel}`,
          metadata: {
            customerId,
            channel,
            scheduledFor: request.scheduledFor?.toISOString(),
          },
        },
      });

      return request;
    });

    // Queue for processing
    await addJobToQueue('send-request', {
      requestId: reviewRequest.id,
      retryCount: 0,
    });

    loggers.business.reviewRequestCreated({
      requestId: reviewRequest.id,
      businessId,
      customerId,
      channel,
    });

    return { success: true, data: reviewRequest };
  } catch (error) {
    logger.error('Failed to create review request', {
      businessId: params.businessId,
      customerId: params.customerId,
      error,
    });

    return {
      success: false,
      error: 'Failed to create review request',
    };
  }
}

/**
 * Create multiple review requests in bulk
 */
export async function createBulkReviewRequests(params: BulkCreateReviewRequestParams): Promise<
  Result<{
    successful: ReviewRequestSummary[];
    failed: Array<{ customerId: string; error: string }>;
  }>
> {
  try {
    const { businessId, customerIds, channel, subject, messageContent, reviewUrl, scheduledFor } =
      params;

    logger.info('Creating bulk review requests', {
      businessId,
      customerCount: customerIds.length,
      channel,
    });

    const results: ReviewRequestSummary[] = [];
    const failures: Array<{ customerId: string; error: string }> = [];

    // Process customers in batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < customerIds.length; i += batchSize) {
      const batch = customerIds.slice(i, i + batchSize);

      const batchPromises = batch.map(async customerId => {
        const result = await createReviewRequest({
          businessId,
          customerId,
          channel,
          subject,
          messageContent,
          reviewUrl,
          scheduledFor,
        });

        if (result.success) {
          results.push(result.data);
        } else {
          failures.push({ customerId, error: result.error });
        }
      });

      await Promise.all(batchPromises);
    }

    logger.info('Bulk review request creation completed', {
      businessId,
      successful: results.length,
      failed: failures.length,
    });

    return {
      success: true,
      data: {
        successful: results,
        failed: failures,
      },
    };
  } catch (error) {
    logger.error('Failed to create bulk review requests', {
      businessId: params.businessId,
      error,
    });

    return {
      success: false,
      error: 'Failed to create bulk review requests',
    };
  }
}

/**
 * Update review request status and metadata
 */
export async function updateReviewRequest(
  requestId: string,
  updates: UpdateReviewRequestInput
): Promise<Result<void>> {
  try {
    await prisma.reviewRequest.update({
      where: { id: requestId },
      data: updates,
    });

    logger.info('Review request updated', { requestId, updates });
    return { success: true, data: undefined };
  } catch (error) {
    logger.error('Failed to update review request', { requestId, updates, error });
    return { success: false, error: 'Failed to update review request' };
  }
}

/**
 * Get review request by ID with full details
 */
export async function getReviewRequestById(
  requestId: string,
  businessId?: string
): Promise<Result<ReviewRequestSummary | null>> {
  try {
    const where: any = { id: requestId, isActive: true };
    if (businessId) {
      where.businessId = businessId;
    }

    const reviewRequest = await prisma.reviewRequest.findFirst({
      where,
      select: {
        id: true,
        businessId: true,
        customerId: true,
        channel: true,
        status: true,
        trackingUuid: true,
        trackingUrl: true,
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

    return { success: true, data: reviewRequest };
  } catch (error) {
    logger.error('Failed to get review request', { requestId, businessId, error });
    return { success: false, error: 'Failed to get review request' };
  }
}

/**
 * Get review request by tracking UUID
 */
export async function getReviewRequestByTrackingUuid(
  trackingUuid: string
): Promise<Result<ReviewRequestSummary | null>> {
  try {
    const reviewRequest = await prisma.reviewRequest.findUnique({
      where: { trackingUuid, isActive: true },
      select: {
        id: true,
        businessId: true,
        customerId: true,
        channel: true,
        status: true,
        trackingUuid: true,
        trackingUrl: true,
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

    return { success: true, data: reviewRequest };
  } catch (error) {
    logger.error('Failed to get review request by tracking UUID', { trackingUuid, error });
    return { success: false, error: 'Failed to get review request' };
  }
}

/**
 * Mark review request as clicked and log event
 */
export async function markReviewRequestClicked(
  requestId: string,
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
  }
): Promise<Result<void>> {
  try {
    await prisma.$transaction(async tx => {
      // Update request status
      const request = await tx.reviewRequest.update({
        where: { id: requestId },
        data: {
          status: 'CLICKED',
          clickedAt: new Date(),
        },
      });

      // Log event
      await tx.event.create({
        data: {
          businessId: request.businessId,
          reviewRequestId: requestId,
          type: 'REQUEST_CLICKED',
          source: 'system',
          description: 'Review request link clicked',
          metadata,
          ipAddress: metadata?.ipAddress,
          userAgent: metadata?.userAgent,
        },
      });
    });

    loggers.business.reviewRequestClicked({
      requestId,
      businessId: '', // Will be filled by the transaction
      userAgent: metadata?.userAgent,
      ip: metadata?.ipAddress,
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error('Failed to mark review request as clicked', { requestId, error });
    return { success: false, error: 'Failed to update click status' };
  }
}

/**
 * Get review request statistics for a business
 */
export async function getReviewRequestStats(
  businessId: string,
  dateRange?: { from: Date; to: Date }
): Promise<
  Result<{
    total: number;
    byStatus: Record<string, number>;
    byChannel: Record<string, number>;
    deliveryRate: number;
    clickRate: number;
  }>
> {
  try {
    const where: any = { businessId, isActive: true };

    if (dateRange) {
      where.createdAt = {
        gte: dateRange.from,
        lte: dateRange.to,
      };
    }

    const [total, statusCounts, channelCounts] = await Promise.all([
      prisma.reviewRequest.count({ where }),

      prisma.reviewRequest.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),

      prisma.reviewRequest.groupBy({
        by: ['channel'],
        where,
        _count: true,
      }),
    ]);

    const byStatus = statusCounts.reduce(
      (acc, item) => {
        acc[item.status] = item._count;
        return acc;
      },
      {} as Record<string, number>
    );

    const byChannel = channelCounts.reduce(
      (acc, item) => {
        acc[item.channel] = item._count;
        return acc;
      },
      {} as Record<string, number>
    );

    const delivered = byStatus.DELIVERED || 0;
    const sent = byStatus.SENT || 0;
    const clicked = byStatus.CLICKED || 0;
    const completed = byStatus.COMPLETED || 0;

    const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0;
    const clickRate = delivered > 0 ? ((clicked + completed) / delivered) * 100 : 0;

    return {
      success: true,
      data: {
        total,
        byStatus,
        byChannel,
        deliveryRate: Math.round(deliveryRate * 100) / 100,
        clickRate: Math.round(clickRate * 100) / 100,
      },
    };
  } catch (error) {
    logger.error('Failed to get review request stats', { businessId, error });
    return { success: false, error: 'Failed to get statistics' };
  }
}
