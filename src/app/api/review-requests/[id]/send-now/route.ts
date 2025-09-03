import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getBusinessContext } from '@/lib/auth-context';
import type { ApiSuccessResponse, ApiErrorResponse } from '@/types/api';
import { createBusinessScope } from '@/lib/db/businessScoped';
import { logger } from '@/lib/logger';
import { getQueue } from '@/services/job-queue';

interface RouteParams {
  id: string;
}

// POST /api/review-requests/[id]/send-now - Send a scheduled request immediately
export async function POST(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { businessId } = await getBusinessContext();
    const scope = createBusinessScope(businessId);
    const { id: requestId } = params;

    if (!requestId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Request ID is required',
          },
        } satisfies ApiErrorResponse,
        { status: 400 }
      );
    }

    // Get the review request
    const reviewRequest = await scope.findUniqueReviewRequest({
      where: { id: requestId },
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
    });

    if (!reviewRequest) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Review request not found',
          },
        } satisfies ApiErrorResponse,
        { status: 404 }
      );
    }

    // Validate that the request is scheduled and still pending
    if (!reviewRequest.scheduledFor || reviewRequest.status !== 'QUEUED') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Request is not scheduled or already processed',
          },
        } satisfies ApiErrorResponse,
        { status: 400 }
      );
    }

    // Update the request to remove scheduling and mark for immediate sending
    const updatedRequest = await prisma.$transaction(async tx => {
      // Update request to remove scheduled time and mark for immediate processing
      const updated = await tx.reviewRequest.update({
        where: { id: requestId },
        data: {
          scheduledFor: null, // Remove scheduling
          // Status stays QUEUED but will be processed immediately
        },
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
      });

      // Log the send-now event
      await tx.event.create({
        data: {
          businessId,
          reviewRequestId: requestId,
          type: 'REQUEST_QUEUED',
          source: 'user',
          description: 'Scheduled request converted to immediate send by user',
          metadata: {
            originalScheduledFor: reviewRequest.scheduledFor,
            convertedAt: new Date().toISOString(),
            action: 'send_now',
          },
        },
      });

      return updated;
    });

    // Update the job in the queue to send immediately
    try {
      const queue = getQueue('email-queue');
      if (queue) {
        // Remove old scheduled job
        const jobs = await queue.getJobs(['delayed'], 0, 1000);
        const oldJob = jobs.find(job => job.data?.requestId === requestId);
        if (oldJob) {
          await oldJob.remove();
        }

        // Add new job for immediate processing (no delay)
        await queue.add(
          'send-request',
          {
            requestId,
            retryCount: 0,
          },
          {
            priority: 10, // Higher priority for immediate sends
            removeOnComplete: 10,
            removeOnFail: 5,
          }
        );

        logger.info('Successfully queued request for immediate sending', {
          requestId,
          businessId,
          customerId: reviewRequest.customerId,
          originalScheduledFor: reviewRequest.scheduledFor,
        });
      }
    } catch (queueError) {
      logger.error('Failed to queue request for immediate sending', {
        requestId,
        error: queueError instanceof Error ? queueError.message : 'Unknown error',
      });

      // Revert the database update if queue update failed
      await prisma.reviewRequest.update({
        where: { id: requestId },
        data: {
          scheduledFor: reviewRequest.scheduledFor,
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'QUEUE_ERROR',
            message: 'Failed to queue request for immediate sending',
          },
        } satisfies ApiErrorResponse,
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        request: updatedRequest,
        message: 'Request queued for immediate sending',
      },
    } satisfies ApiSuccessResponse<{ message: string; sent: boolean; jobId?: string }>);
  } catch (error) {
    logger.error('Failed to send request immediately', {
      requestId: params.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to send request immediately',
        },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}
