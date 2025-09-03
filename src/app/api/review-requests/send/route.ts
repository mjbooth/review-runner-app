import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { processReviewRequest } from '@/services/messaging-simple';
import type { ApiSuccessResponse, ApiErrorResponse } from '@/types/api';

const sendRequestSchema = z.object({
  reviewRequestId: z.string(),
});

const sendBulkRequestsSchema = z.object({
  reviewRequestIds: z.array(z.string()),
});

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        } satisfies ApiErrorResponse,
        { status: 401 }
      );
    }

    // Get business for this user
    const business = await prisma.business.findUnique({
      where: { clerkUserId: userId },
      select: { id: true },
    });

    if (!business) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'BUSINESS_NOT_FOUND', message: 'Business not found' },
        } satisfies ApiErrorResponse,
        { status: 404 }
      );
    }

    const body = await request.json();

    // Check if this is a bulk send request
    if (body.reviewRequestIds && Array.isArray(body.reviewRequestIds)) {
      const { reviewRequestIds } = sendBulkRequestsSchema.parse(body);

      // Process all requests in parallel
      const results = await Promise.allSettled(
        reviewRequestIds.map(async requestId => {
          // Verify request belongs to this business
          const reviewRequest = await prisma.reviewRequest.findFirst({
            where: {
              id: requestId,
              businessId: business.id,
            },
          });

          if (!reviewRequest) {
            throw new Error(`Review request ${requestId} not found or access denied`);
          }

          return processReviewRequest(requestId);
        })
      );

      const successful = results.filter(
        (r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value.success
      );
      const failed = results.filter(
        r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)
      );

      const response: ApiSuccessResponse<{ sent: number; failed: number; results: any[] }> = {
        success: true,
        data: {
          sent: successful.length,
          failed: failed.length,
          results: results.map((r, index) => ({
            requestId: reviewRequestIds[index],
            success: r.status === 'fulfilled' && r.value.success,
            error:
              r.status === 'rejected'
                ? r.reason
                : r.status === 'fulfilled' && !r.value.success
                  ? r.value.error
                  : null,
          })),
        },
      };

      return NextResponse.json(response);
    } else {
      // Single request send
      const { reviewRequestId } = sendRequestSchema.parse(body);

      // Verify request belongs to this business
      const reviewRequest = await prisma.reviewRequest.findFirst({
        where: {
          id: reviewRequestId,
          businessId: business.id,
        },
      });

      if (!reviewRequest) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Review request not found' },
          } satisfies ApiErrorResponse,
          { status: 404 }
        );
      }

      const result = await processReviewRequest(reviewRequestId);

      if (result.success) {
        const response: ApiSuccessResponse<{ messageId?: string }> = {
          success: true,
          data: {
            messageId: result.messageId,
          },
        };

        return NextResponse.json(response);
      } else {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'SEND_FAILED', message: result.error || 'Failed to send message' },
          } satisfies ApiErrorResponse,
          { status: 400 }
        );
      }
    }
  } catch (error) {
    console.error('Error sending review request:', error);

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
        error: { code: 'INTERNAL_ERROR', message: 'Failed to send review request' },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}
