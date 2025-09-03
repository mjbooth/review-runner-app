import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { googlePlacesService } from '@/services/google-places';
import { logger } from '@/lib/logger';
import type { ApiSuccessResponse, ApiErrorResponse } from '@/types/api';

// Validation schema for search request
const searchPlacesSchema = z.object({
  query: z.string().min(1).max(200),
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
    const { query } = searchPlacesSchema.parse(body);

    logger.info('Searching places for onboarding', { query, userId });

    // Use the Google Places service to search for places
    const places = await googlePlacesService.searchPlaces(query);

    const response: ApiSuccessResponse<typeof places> = {
      success: true,
      data: places,
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

    logger.error('Search places API error', {
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
