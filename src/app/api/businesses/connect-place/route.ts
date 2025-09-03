import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { googlePlacesService } from '@/services/google-places';
import { logger } from '@/lib/logger';
import type { ApiSuccessResponse, ApiErrorResponse } from '@/types/api';

// Validation schema for connect place request
const connectPlaceSchema = z.object({
  googleMapsUrl: z.string().url().min(1),
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
    const { googleMapsUrl } = connectPlaceSchema.parse(body);

    logger.info({
      event: 'Extracting business from Google Maps URL for onboarding',
      url: googleMapsUrl.substring(0, 100) + '...',
      userId,
    });

    // Extract business details from Google Places URL
    const placeDetails = await googlePlacesService.getBusinessFromUrl(googleMapsUrl);

    if (!placeDetails) {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: 'PLACE_URL_INVALID',
          message:
            "Could not extract business details from the provided URL. Please make sure it's a valid Google Maps business URL.",
        },
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Return the business details for use in onboarding
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

    logger.error({
      event: 'Connect place API error',
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
