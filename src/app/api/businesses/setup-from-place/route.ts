import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { googlePlacesService } from '@/services/google-places';
import { logger } from '@/lib/logger';
import type { ApiSuccessResponse, ApiErrorResponse } from '@/types/api';

// Validation schema for business setup from place
const setupFromPlaceSchema = z.object({
  // Google Places data
  placeId: z.string().min(1),
  placeName: z.string().min(1),
  placeAddress: z.string().min(1),
  placePhone: z.string().optional(),
  placeWebsite: z.string().url().optional(),
  placeRating: z.number().optional(),
  placeReviewCount: z.number().optional(),
  placeTypes: z.array(z.string()).default([]),
  placePhotos: z.array(z.any()).optional(),
  googleMapsUrl: z.string().url().optional(),

  // Business profile data
  businessName: z.string().min(1),
  businessEmail: z.string().email(),
  businessPhone: z.string().optional(),
  businessAddress: z.string().min(1),
  businessWebsite: z.string().url().optional(),
  timezone: z.string().default('Europe/London'),
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
    const data = setupFromPlaceSchema.parse(body);

    logger.info('Setting up business from Google Place', {
      placeId: data.placeId,
      businessName: data.businessName,
      userId,
    });

    // Check if business already exists for this user
    const existingBusiness = await prisma.business.findUnique({
      where: { clerkUserId: userId },
      select: { id: true, name: true, createdAt: true },
    });

    if (existingBusiness) {
      logger.info('Business already exists for user', {
        userId,
        businessId: existingBusiness.id,
        businessName: existingBusiness.name,
        createdAt: existingBusiness.createdAt,
      });

      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: 'BUSINESS_EXISTS',
          message: 'Business profile already exists for this user',
          details: `Business "${existingBusiness.name}" created on ${existingBusiness.createdAt}`,
        },
      };
      return NextResponse.json(response, { status: 409 });
    }

    // Generate Google Review URL
    const googleReviewUrl = googlePlacesService.generateReviewUrl(data.placeId);

    // Create business with Google Places data and link to user in a transaction
    const result = await prisma.$transaction(async tx => {
      // Create the business
      const business = await tx.business.create({
        data: {
          clerkUserId: userId,
          name: data.businessName,
          email: data.businessEmail,
          phone: data.businessPhone || data.placePhone || null,
          address: data.businessAddress,
          website: data.businessWebsite || data.placeWebsite || null,

          // Google Places data
          googlePlaceId: data.placeId,
          googlePlaceName: data.placeName,
          googleReviewUrl,
          googleMapsUrl: data.googleMapsUrl || null,
          googleRating: data.placeRating || null,
          googleReviewCount: data.placeReviewCount || null,
          googleTypes: data.placeTypes,
          googlePhoneNumber: data.placePhone || null,
          googleWebsite: data.placeWebsite || null,
          googlePhotos: data.placePhotos ? JSON.parse(JSON.stringify(data.placePhotos)) : null,
          lastSyncedAt: new Date(),

          timezone: data.timezone,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          website: true,
          googlePlaceId: true,
          googlePlaceName: true,
          googleReviewUrl: true,
          googleMapsUrl: true,
          googleRating: true,
          googleReviewCount: true,
          timezone: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Update the user record to link to this business (or create if it doesn't exist)
      await tx.user.upsert({
        where: { clerkUserId: userId },
        update: {
          businessId: business.id,
          lastActiveAt: new Date(),
        },
        create: {
          clerkUserId: userId,
          businessId: business.id,
          email: data.businessEmail,
          onboardingStatus: 'IN_PROGRESS',
          onboardingStep: 1,
          onboardingCompletedSteps: [0],
          lastActiveAt: new Date(),
        },
      });

      return business;
    });

    const business = result;

    logger.info('Business created successfully from Google Place', {
      businessId: business.id,
      businessName: business.name,
      placeId: data.placeId,
      userId,
    });

    const response: ApiSuccessResponse<typeof business> = {
      success: true,
      data: business,
    };

    return NextResponse.json(response, { status: 201 });
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

    logger.error('Setup business from place API error', {
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
