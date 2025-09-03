import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { googlePlacesService } from '@/services/google-places';
import { logger } from '@/lib/logger';
import type { ApiSuccessResponse, ApiErrorResponse } from '@/types/api';

// Validation schema for place details request
const placeDetailsSchema = z.object({
  placeId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      const response: ApiErrorResponse = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      };
      return NextResponse.json(response, { status: 401 });
    }

    const body = await request.json();
    const { placeId } = placeDetailsSchema.parse(body);

    logger.info('Getting place details for onboarding', { placeId, userId });

    // Use the Google Places service to get detailed place information
    const placeDetails = await googlePlacesService.getPlaceDetails(placeId);

    if (!placeDetails) {
      const response: ApiErrorResponse = {
        success: false,
        error: { code: 'PLACE_NOT_FOUND', message: 'Place details not found' },
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiSuccessResponse<typeof placeDetails> = {
      success: true,
      data: placeDetails,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.errors,
        },
      };
      return NextResponse.json(response, { status: 400 });
    }

    logger.error('Place details API error', {
      error: error instanceof Error ? error.message : String(error),
      userId: (await auth()).userId,
    });

    const response: ApiErrorResponse = {
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Internal server error' },
    };
    return NextResponse.json(response, { status: 500 });
  }
}
