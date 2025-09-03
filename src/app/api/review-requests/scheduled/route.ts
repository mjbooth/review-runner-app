import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getBusinessContext } from '@/lib/auth-context';
import type { ApiSuccessResponse, ApiErrorResponse } from '@/types/api';
import type { RequestChannel, RequestStatus } from '@prisma/client';
import { createBusinessScope } from '@/lib/db/businessScoped';
import { logger } from '@/lib/logger';

const updateScheduledRequestSchema = z.object({
  scheduledFor: z.string().datetime().optional(),
  action: z.enum(['reschedule', 'cancel']),
});

const listScheduledRequestsSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  channel: z.enum(['SMS', 'EMAIL']).optional(),
  scheduledAfter: z.string().datetime().optional(),
  scheduledBefore: z.string().datetime().optional(),
});

type UpdateScheduledRequestBody = z.infer<typeof updateScheduledRequestSchema>;
type ListScheduledRequestsQuery = z.infer<typeof listScheduledRequestsSchema>;

// GET /api/review-requests/scheduled - List all scheduled review requests
export async function GET(request: NextRequest) {
  try {
    const { businessId } = await getBusinessContext();
    const scope = createBusinessScope(businessId);

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const query: ListScheduledRequestsQuery = {
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '20'),
      channel: (searchParams.get('channel') as 'SMS' | 'EMAIL' | null) || undefined,
      scheduledAfter: searchParams.get('scheduledAfter') || undefined,
      scheduledBefore: searchParams.get('scheduledBefore') || undefined,
    };

    const validatedQuery = listScheduledRequestsSchema.parse(query);
    const offset = (validatedQuery.page - 1) * validatedQuery.limit;

    // Build where clause
    const where: any = {
      businessId,
      status: 'QUEUED',
      scheduledFor: {
        not: null,
        ...(validatedQuery.scheduledAfter && { gte: new Date(validatedQuery.scheduledAfter) }),
        ...(validatedQuery.scheduledBefore && { lte: new Date(validatedQuery.scheduledBefore) }),
      },
    };

    if (validatedQuery.channel) {
      where.channel = validatedQuery.channel;
    }

    // Get scheduled requests with pagination
    const [scheduledRequests, totalCount] = await Promise.all([
      scope.findManyReviewRequests({
        where,
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
        },
        orderBy: { scheduledFor: 'asc' },
        take: validatedQuery.limit,
        skip: offset,
      }),
      scope.countReviewRequests({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / validatedQuery.limit);

    return NextResponse.json({
      success: true,
      data: {
        requests: scheduledRequests,
        pagination: {
          page: validatedQuery.page,
          limit: validatedQuery.limit,
          totalCount,
          totalPages,
          hasNextPage: validatedQuery.page < totalPages,
          hasPrevPage: validatedQuery.page > 1,
        },
      },
    } satisfies ApiSuccessResponse<any>);
  } catch (error) {
    logger.error('Failed to list scheduled review requests', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to list scheduled review requests',
        },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}

// PUT /api/review-requests/scheduled/[id] would handle individual scheduled request updates
// This is handled by a separate dynamic route file
