import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getBusinessContext } from '@/lib/auth-context';
import type { ApiSuccessResponse, ApiErrorResponse } from '@/types/api';
import { createBusinessScope } from '@/lib/db/businessScoped';
import { logger } from '@/lib/logger';

const createSuppressionSchema = z.object({
  contact: z.string().email('Invalid email address'),
  channel: z.enum(['EMAIL', 'SMS']),
  reason: z.enum(['USER_REQUEST', 'BOUNCE', 'SPAM', 'UNSUBSCRIBE', 'MANUAL']),
  source: z.enum(['manual', 'webhook', 'system']),
  notes: z.string().optional(),
});

type CreateSuppressionBody = z.infer<typeof createSuppressionSchema>;

// POST /api/suppressions - Add a new suppression
export async function POST(request: NextRequest) {
  try {
    const { businessId } = await getBusinessContext();
    const scope = createBusinessScope(businessId);

    // Parse request body
    const body = await request.json();
    const validatedBody = createSuppressionSchema.parse(body);

    // Check if suppression already exists
    const existingSuppressions = await scope.findSuppressions({
      where: {
        contact: validatedBody.contact.toLowerCase(),
        channel: validatedBody.channel,
      },
      take: 1,
    });

    const existingSuppression = existingSuppressions[0];

    if (existingSuppression) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ALREADY_EXISTS',
            message: 'Contact is already suppressed for this channel',
          },
        } satisfies ApiErrorResponse,
        { status: 409 }
      );
    }

    // Create the suppression
    const suppression = await prisma.$transaction(async tx => {
      // Create suppression record
      const newSuppression = await tx.suppression.create({
        data: {
          businessId,
          contact: validatedBody.contact.toLowerCase(),
          channel: validatedBody.channel,
          reason: validatedBody.reason,
          source: validatedBody.source,
          notes: validatedBody.notes,
          isActive: true,
        },
      });

      // Log the suppression event
      await tx.event.create({
        data: {
          businessId,
          type: 'SUPPRESSION_ADDED',
          source: validatedBody.source,
          description: `Contact ${validatedBody.contact} suppressed for ${validatedBody.channel}`,
          metadata: {
            contact: validatedBody.contact,
            channel: validatedBody.channel,
            reason: validatedBody.reason,
            notes: validatedBody.notes,
            suppressionId: newSuppression.id,
          },
        },
      });

      return newSuppression;
    });

    logger.info('Suppression created', {
      businessId,
      suppressionId: suppression.id,
      contact: validatedBody.contact,
      channel: validatedBody.channel,
      reason: validatedBody.reason,
    });

    return NextResponse.json({
      success: true,
      data: {
        suppression,
        message: 'Contact suppressed successfully',
      },
    } satisfies ApiSuccessResponse<any>);
  } catch (error) {
    logger.error('Failed to create suppression', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (error instanceof z.ZodError) {
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

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create suppression',
        },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}

// GET /api/suppressions - Get all suppressions for the business
export async function GET(request: NextRequest) {
  try {
    const { businessId } = await getBusinessContext();
    const scope = createBusinessScope(businessId);

    const { searchParams } = new URL(request.url);
    const channel = searchParams.get('channel');
    const reason = searchParams.get('reason');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause
    const whereClause: any = {
      isActive: true,
    };

    if (channel) {
      whereClause.channel = channel;
    }

    if (reason) {
      whereClause.reason = reason;
    }

    // Get suppressions with pagination
    const suppressions = await scope.findSuppressions({
      where: whereClause,
      orderBy: [{ createdAt: 'desc' }],
      take: Math.min(limit, 100), // Cap at 100
      skip: offset,
    });

    // Get total count separately (business scoped query doesn't have countSuppressions)
    const allSuppressions = await scope.findSuppressions({
      where: whereClause,
    });
    const total = allSuppressions.length;

    return NextResponse.json({
      success: true,
      data: suppressions,
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + suppressions.length < total,
      },
    } satisfies ApiSuccessResponse<any>);
  } catch (error) {
    logger.error('Failed to get suppressions', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get suppressions',
        },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}
