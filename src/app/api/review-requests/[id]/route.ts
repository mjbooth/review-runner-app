import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getBusinessContext } from '@/lib/auth-context';
import type { ApiSuccessResponse, ApiErrorResponse } from '@/types/api';
import { createBusinessScope } from '@/lib/db/businessScoped';
import { updateReviewRequestSchema } from '@/lib/validators/reviewRequest';

interface RouteContext {
  params: { id: string };
}

// GET /api/review-requests/:id - Get individual review request details
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    // Get business context from authenticated user
    const context = await getBusinessContext();
    const businessId = context.businessId;

    // Validate UUID format
    const idSchema = z.string().uuid();
    const requestId = idSchema.parse(params.id);

    // Use business-scoped query to find the review request
    const businessScope = createBusinessScope(businessId);
    const reviewRequest = await businessScope.findReviewRequest(requestId);

    if (!reviewRequest) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Review request not found' },
        } satisfies ApiErrorResponse,
        { status: 404 }
      );
    }

    const response: ApiSuccessResponse<typeof reviewRequest> = {
      success: true,
      data: reviewRequest,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching review request:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request ID format',
            details: error.errors,
          },
        } satisfies ApiErrorResponse,
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Review request not found' },
        } satisfies ApiErrorResponse,
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch review request' },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}

// PUT /api/review-requests/:id - Update review request
export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    // Get business context from authenticated user
    const context = await getBusinessContext();
    const businessId = context.businessId;

    // Validate UUID format
    const idSchema = z.string().uuid();
    const requestId = idSchema.parse(params.id);

    // Parse and validate request body
    const body = await request.json();
    const updateData = updateReviewRequestSchema.parse(body);

    // Use business-scoped query to update the review request
    const businessScope = createBusinessScope(businessId);

    // First verify the request exists and belongs to this business
    const existingRequest = await businessScope.findReviewRequest(requestId);
    if (!existingRequest) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Review request not found' },
        } satisfies ApiErrorResponse,
        { status: 404 }
      );
    }

    // Update the review request
    const updatedRequest = await businessScope.updateReviewRequest(requestId, updateData);

    // Log update event if status changed
    if (updateData.status && updateData.status !== existingRequest.status) {
      await businessScope.createEvent({
        type: getEventTypeForStatus(updateData.status),
        source: 'system',
        description: `Review request status updated to ${updateData.status}`,
        reviewRequest: { connect: { id: requestId } },
        metadata: {
          previousStatus: existingRequest.status,
          newStatus: updateData.status,
          updatedFields: Object.keys(updateData),
        },
      });
    }

    const response: ApiSuccessResponse<typeof updatedRequest> = {
      success: true,
      data: updatedRequest,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error updating review request:', error);

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

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Review request not found' },
        } satisfies ApiErrorResponse,
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update review request' },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}

// DELETE /api/review-requests/:id - Soft delete review request
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    // Get business context from authenticated user
    const context = await getBusinessContext();
    const businessId = context.businessId;

    // Validate UUID format
    const idSchema = z.string().uuid();
    const requestId = idSchema.parse(params.id);

    // Use business-scoped query to soft delete the review request
    const businessScope = createBusinessScope(businessId);
    await businessScope.deleteReviewRequest(requestId);

    // Log deletion event
    await businessScope.createEvent({
      type: 'REQUEST_DELETED',
      source: 'user',
      description: 'Review request deleted',
      reviewRequest: { connect: { id: requestId } },
      metadata: {
        deletedAt: new Date(),
      },
    });

    const response: ApiSuccessResponse<{ id: string; deleted: boolean }> = {
      success: true,
      data: { id: requestId, deleted: true },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error deleting review request:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request ID format',
            details: error.errors,
          },
        } satisfies ApiErrorResponse,
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Review request not found' },
        } satisfies ApiErrorResponse,
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to delete review request' },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}

// Helper function to map status to event type
function getEventTypeForStatus(status: string): string {
  const statusEventMap: Record<string, string> = {
    QUEUED: 'REQUEST_QUEUED',
    SENT: 'REQUEST_SENT',
    DELIVERED: 'REQUEST_DELIVERED',
    CLICKED: 'REQUEST_CLICKED',
    COMPLETED: 'REQUEST_COMPLETED',
    BOUNCED: 'REQUEST_BOUNCED',
    FAILED: 'REQUEST_FAILED',
    OPTED_OUT: 'REQUEST_OPTED_OUT',
    FOLLOWUP_SENT: 'FOLLOWUP_SENT',
  };

  return statusEventMap[status] || 'REQUEST_UPDATED';
}
