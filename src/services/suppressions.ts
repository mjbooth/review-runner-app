import type { RequestChannel, SuppressionReason } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger, loggers } from '../lib/logger';
import type { Result, CreateSuppressionInput } from '../types/database';

export interface SuppressionCheckResult {
  isSuppressed: boolean;
  reason?: string;
  source?: string;
  expiresAt?: Date;
}

export interface CreateSuppressionParams {
  businessId: string;
  contact: string;
  channel?: RequestChannel;
  reason: SuppressionReason;
  source: string;
  notes?: string;
  expiresAt?: Date;
}

/**
 * Check if a contact is suppressed for a specific business and channel
 */
export async function checkSuppressions(
  businessId: string,
  contact: string,
  channel?: RequestChannel
): Promise<Result<SuppressionCheckResult>> {
  try {
    const normalizedContact = contact.toLowerCase().trim();

    // Check for exact channel match first, then global suppressions
    const suppressions = await prisma.suppression.findMany({
      where: {
        businessId,
        contact: normalizedContact,
        isActive: true,
        OR: [
          { channel }, // Specific channel suppression
          { channel: null }, // Global suppression (all channels)
        ],
        OR: [
          { expiresAt: null }, // Never expires
          { expiresAt: { gt: new Date() } }, // Not yet expired
        ],
      },
      orderBy: [
        { channel: 'desc' }, // Channel-specific first
        { createdAt: 'desc' }, // Most recent first
      ],
      take: 1,
    });

    if (suppressions.length === 0) {
      return {
        success: true,
        data: { isSuppressed: false },
      };
    }

    const suppression = suppressions[0];

    // Check if suppression has expired
    if (suppression.expiresAt && suppression.expiresAt <= new Date()) {
      // Mark as inactive if expired
      await prisma.suppression.update({
        where: { id: suppression.id },
        data: { isActive: false },
      });

      return {
        success: true,
        data: { isSuppressed: false },
      };
    }

    return {
      success: true,
      data: {
        isSuppressed: true,
        reason: suppression.reason,
        source: suppression.source,
        expiresAt: suppression.expiresAt,
      },
    };
  } catch (error) {
    logger.error('Failed to check suppressions', {
      businessId,
      contact: contact.slice(0, 5) + '***', // Partial contact for privacy
      channel,
      error,
    });

    return {
      success: false,
      error: 'Failed to check suppression status',
    };
  }
}

/**
 * Add a new suppression
 */
export async function addSuppression(
  params: CreateSuppressionParams
): Promise<Result<{ id: string }>> {
  try {
    const { businessId, contact, channel, reason, source, notes, expiresAt } = params;
    const normalizedContact = contact.toLowerCase().trim();

    // Use upsert to handle duplicate suppressions
    const suppression = await prisma.suppression.upsert({
      where: {
        businessId_contact_channel: {
          businessId,
          contact: normalizedContact,
          channel: channel || null,
        },
      },
      update: {
        reason,
        source,
        notes,
        expiresAt,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        businessId,
        contact: normalizedContact,
        channel,
        reason,
        source,
        notes,
        expiresAt,
      },
    });

    // Log suppression event
    await prisma.event.create({
      data: {
        businessId,
        type: 'SUPPRESSION_ADDED',
        source,
        description: `Contact suppressed: ${reason}`,
        metadata: {
          contact: normalizedContact,
          channel,
          reason,
          source,
          expiresAt: expiresAt?.toISOString(),
        },
      },
    });

    loggers.business.suppressionAdded({
      businessId,
      contact: normalizedContact.slice(0, 5) + '***',
      channel: channel || undefined,
      reason,
    });

    logger.info('Suppression added', {
      businessId,
      suppressionId: suppression.id,
      reason,
      channel,
    });

    return { success: true, data: { id: suppression.id } };
  } catch (error) {
    logger.error('Failed to add suppression', {
      businessId: params.businessId,
      contact: params.contact.slice(0, 5) + '***',
      reason: params.reason,
      error,
    });

    return {
      success: false,
      error: 'Failed to add suppression',
    };
  }
}

/**
 * Remove a suppression (mark as inactive)
 */
export async function removeSuppression(
  businessId: string,
  suppressionId: string
): Promise<Result<void>> {
  try {
    const suppression = await prisma.suppression.updateMany({
      where: {
        id: suppressionId,
        businessId,
        isActive: true,
      },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    if (suppression.count === 0) {
      return { success: false, error: 'Suppression not found or already inactive' };
    }

    logger.info('Suppression removed', { businessId, suppressionId });
    return { success: true, data: undefined };
  } catch (error) {
    logger.error('Failed to remove suppression', { businessId, suppressionId, error });
    return { success: false, error: 'Failed to remove suppression' };
  }
}

/**
 * Handle webhook-based suppressions (SMS STOP, email unsubscribe, etc.)
 */
export async function handleWebhookSuppression(
  businessId: string,
  contact: string,
  channel: RequestChannel,
  reason: SuppressionReason,
  source: string,
  metadata?: Record<string, unknown>
): Promise<Result<void>> {
  try {
    const suppressionResult = await addSuppression({
      businessId,
      contact,
      channel,
      reason,
      source,
      notes: `Automatic suppression from ${source}`,
    });

    if (!suppressionResult.success) {
      return suppressionResult;
    }

    // Update any active review requests for this contact to OPTED_OUT
    const updateResult = await prisma.reviewRequest.updateMany({
      where: {
        businessId,
        customer: {
          OR: [
            ...(channel === 'EMAIL' ? [{ email: contact.toLowerCase() }] : []),
            ...(channel === 'SMS' ? [{ phone: contact }] : []),
          ],
        },
        status: {
          in: ['QUEUED', 'SENT', 'DELIVERED'],
        },
        isActive: true,
      },
      data: {
        status: 'OPTED_OUT',
        updatedAt: new Date(),
      },
    });

    if (updateResult.count > 0) {
      logger.info('Updated active review requests due to suppression', {
        businessId,
        contact: contact.slice(0, 5) + '***',
        updatedCount: updateResult.count,
      });
    }

    // Log webhook suppression event
    await prisma.event.create({
      data: {
        businessId,
        type: 'REQUEST_OPTED_OUT',
        source,
        description: `Contact opted out via ${source}`,
        metadata: {
          contact: contact.toLowerCase(),
          channel,
          reason,
          ...metadata,
        },
      },
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error('Failed to handle webhook suppression', {
      businessId,
      contact: contact.slice(0, 5) + '***',
      channel,
      reason,
      source,
      error,
    });

    return {
      success: false,
      error: 'Failed to process suppression',
    };
  }
}

/**
 * Bulk check suppressions for multiple contacts
 */
export async function checkBulkSuppressions(
  businessId: string,
  contacts: Array<{ contact: string; channel?: RequestChannel }>
): Promise<Result<Record<string, SuppressionCheckResult>>> {
  try {
    const results: Record<string, SuppressionCheckResult> = {};

    // Process in batches to avoid overwhelming the database
    const batchSize = 50;
    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);

      const batchPromises = batch.map(async ({ contact, channel }) => {
        const result = await checkSuppressions(businessId, contact, channel);
        const key = `${contact}:${channel || 'ALL'}`;

        if (result.success) {
          results[key] = result.data;
        } else {
          results[key] = { isSuppressed: false }; // Default to not suppressed on error
        }
      });

      await Promise.all(batchPromises);
    }

    return { success: true, data: results };
  } catch (error) {
    logger.error('Failed to check bulk suppressions', {
      businessId,
      contactCount: contacts.length,
      error,
    });
    return { success: false, error: 'Failed to check bulk suppressions' };
  }
}

/**
 * Get suppression statistics for a business
 */
export async function getSuppressionStats(businessId: string): Promise<
  Result<{
    total: number;
    byReason: Record<string, number>;
    byChannel: Record<string, number>;
    active: number;
    expired: number;
  }>
> {
  try {
    const [totalCount, reasonCounts, channelCounts, activeCount, expiredCount] = await Promise.all([
      prisma.suppression.count({
        where: { businessId, isActive: true },
      }),

      prisma.suppression.groupBy({
        by: ['reason'],
        where: { businessId, isActive: true },
        _count: true,
      }),

      prisma.suppression.groupBy({
        by: ['channel'],
        where: { businessId, isActive: true },
        _count: true,
      }),

      prisma.suppression.count({
        where: {
          businessId,
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),

      prisma.suppression.count({
        where: {
          businessId,
          isActive: true,
          expiresAt: { lte: new Date() },
        },
      }),
    ]);

    const byReason = reasonCounts.reduce(
      (acc, item) => {
        acc[item.reason] = item._count;
        return acc;
      },
      {} as Record<string, number>
    );

    const byChannel = channelCounts.reduce(
      (acc, item) => {
        const channel = item.channel || 'ALL';
        acc[channel] = item._count;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      success: true,
      data: {
        total: totalCount,
        byReason,
        byChannel,
        active: activeCount,
        expired: expiredCount,
      },
    };
  } catch (error) {
    logger.error('Failed to get suppression stats', { businessId, error });
    return { success: false, error: 'Failed to get suppression statistics' };
  }
}
