import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getBusinessContext } from '@/lib/auth-context';
import type { ApiSuccessResponse, ApiErrorResponse } from '@/types/api';
import { createBusinessScope } from '@/lib/db/businessScoped';
import { logger } from '@/lib/logger';
import { getQueue } from '@/services/job-queue';

const updateScheduledRequestSchema = z.object({
  action: z.enum(['reschedule', 'cancel']),
  scheduledFor: z.string().datetime().optional(),
});

type UpdateScheduledRequestBody = z.infer<typeof updateScheduledRequestSchema>;

interface RouteParams {
  id: string;
}

// PUT /api/review-requests/scheduled/[id] - Update a scheduled review request
export async function PUT(request: NextRequest, { params }: { params: RouteParams }) {
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

    // Parse request body
    const body = await request.json();
    const validatedBody = updateScheduledRequestSchema.parse(body);

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
            message: 'Scheduled review request not found',
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

    let updatedRequest;

    if (validatedBody.action === 'cancel') {
      // Cancel the scheduled request
      updatedRequest = await prisma.$transaction(async tx => {
        // Update request status to cancelled
        const updated = await tx.reviewRequest.update({
          where: { id: requestId },
          data: {
            status: 'FAILED',
            errorMessage: 'Cancelled by user',
            sentAt: null,
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

        // Log cancellation event
        await tx.event.create({
          data: {
            businessId,
            reviewRequestId: requestId,
            type: 'REQUEST_FAILED',
            source: 'user',
            description: 'Scheduled request cancelled by user',
            metadata: {
              originalScheduledFor: reviewRequest.scheduledFor,
              cancelledAt: new Date().toISOString(),
              reason: 'user_cancellation',
            },
          },
        });

        return updated;
      });

      // Try to remove the job from the queue (best effort)
      try {
        const queue = getQueue('email-queue');
        if (queue) {
          const jobs = await queue.getJobs(['delayed'], 0, 1000);
          const jobToCancel = jobs.find(job => job.data?.requestId === requestId);
          if (jobToCancel) {
            await jobToCancel.remove();
            logger.info('Successfully removed scheduled job from queue', {
              jobId: jobToCancel.id,
              requestId,
            });
          }
        }
      } catch (queueError) {
        logger.warn('Could not remove scheduled job from queue', {
          requestId,
          error: queueError instanceof Error ? queueError.message : 'Unknown error',
        });
      }
    } else if (validatedBody.action === 'reschedule') {
      // Reschedule the request
      if (!validatedBody.scheduledFor) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_REQUEST',
              message: 'New scheduled time is required for rescheduling',
            },
          } satisfies ApiErrorResponse,
          { status: 400 }
        );
      }

      const newScheduledTime = new Date(validatedBody.scheduledFor);
      const now = new Date();

      // Validate new scheduled time is in the future
      if (newScheduledTime <= now) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_REQUEST',
              message: 'New scheduled time must be in the future',
            },
          } satisfies ApiErrorResponse,
          { status: 400 }
        );
      }

      // Validate new scheduled time is not too far in the future (6 months)
      const sixMonthsFromNow = new Date();
      sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
      if (newScheduledTime > sixMonthsFromNow) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_REQUEST',
              message: 'Cannot schedule more than 6 months ahead',
            },
          } satisfies ApiErrorResponse,
          { status: 400 }
        );
      }

      updatedRequest = await prisma.$transaction(async tx => {
        // Update the scheduled time
        const updated = await tx.reviewRequest.update({
          where: { id: requestId },
          data: {
            scheduledFor: newScheduledTime,
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

        // Log rescheduling event
        await tx.event.create({
          data: {
            businessId,
            reviewRequestId: requestId,
            type: 'REQUEST_QUEUED',
            source: 'user',
            description: 'Scheduled request rescheduled by user',
            metadata: {
              originalScheduledFor: reviewRequest.scheduledFor,
              newScheduledFor: newScheduledTime.toISOString(),
              rescheduledAt: new Date().toISOString(),
            },
          },
        });

        return updated;
      });

      // Update the job in the queue
      try {
        const queue = getQueue('email-queue');
        if (queue) {
          // Remove old job
          const jobs = await queue.getJobs(['delayed'], 0, 1000);
          const oldJob = jobs.find(job => job.data?.requestId === requestId);
          if (oldJob) {
            await oldJob.remove();
          }

          // Add new job with updated delay
          const delay = newScheduledTime.getTime() - now.getTime();
          await queue.add(
            'send-request',
            {
              requestId,
              retryCount: 0,
            },
            {
              delay,
              priority: 5,
              removeOnComplete: 10,
              removeOnFail: 5,
            }
          );

          logger.info('Successfully rescheduled job in queue', {
            requestId,
            oldScheduledFor: reviewRequest.scheduledFor,
            newScheduledFor: newScheduledTime.toISOString(),
            delay: `${Math.round(delay / (1000 * 60))} minutes`,
          });
        }
      } catch (queueError) {
        logger.error('Failed to reschedule job in queue', {
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
              message: 'Failed to reschedule the job in queue',
            },
          } satisfies ApiErrorResponse,
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        request: updatedRequest,
        action: validatedBody.action,
        message:
          validatedBody.action === 'cancel'
            ? 'Request cancelled successfully'
            : 'Request rescheduled successfully',
      },
    } satisfies ApiSuccessResponse<any>);
  } catch (error) {
    logger.error('Failed to update scheduled review request', {
      requestId: params.id,
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
          message: 'Failed to update scheduled review request',
        },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}

// GET /api/review-requests/scheduled/[id] - Get a specific scheduled review request
export async function GET(request: NextRequest, { params }: { params: RouteParams }) {
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
        template: {
          select: {
            id: true,
            name: true,
            category: true,
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
            message: 'Scheduled review request not found',
          },
        } satisfies ApiErrorResponse,
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: reviewRequest,
    } satisfies ApiSuccessResponse<any>);
  } catch (error) {
    logger.error('Failed to get scheduled review request', {
      requestId: params.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get scheduled review request',
        },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}
