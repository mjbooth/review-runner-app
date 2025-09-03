import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getBusinessContext } from '@/lib/auth-context';
import type { ApiSuccessResponse, ApiErrorResponse } from '@/types/api';

export async function GET(_request: NextRequest) {
  try {
    // Get business context from authenticated user
    const context = await getBusinessContext();
    const businessId = context.businessId;

    // Get business data from database with all onboarding fields
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        website: true,
        timezone: true,
        googlePlaceId: true,
        googlePlaceName: true,
        googleReviewUrl: true,
        googleMapsUrl: true,
        googleRating: true,
        googleReviewCount: true,
        googleTypes: true,
        googlePhoneNumber: true,
        googleWebsite: true,
        googlePhotos: true,
        lastSyncedAt: true,
        smsCreditsUsed: true,
        smsCreditsLimit: true,
        emailCreditsUsed: true,
        emailCreditsLimit: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
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

    const response: ApiSuccessResponse<typeof business> = {
      success: true,
      data: business,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Get business API error:', error);

    if (error instanceof Error && error.message.includes('UNAUTHORIZED')) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiErrorResponse,
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Internal server error' },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Get business context from authenticated user
    const context = await getBusinessContext();
    const businessId = context.businessId;

    const body = await request.json();

    // Update business data in database
    const updatedBusiness = await prisma.business.update({
      where: { id: businessId },
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        address: body.address,
        website: body.website,
        timezone: body.timezone,
        googleReviewUrl: body.googleReviewUrl,
        googleMapsUrl: body.googleMapsUrl,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        website: true,
        timezone: true,
        googlePlaceId: true,
        googlePlaceName: true,
        googleReviewUrl: true,
        googleMapsUrl: true,
        googleRating: true,
        googleReviewCount: true,
        googleTypes: true,
        googlePhoneNumber: true,
        googleWebsite: true,
        googlePhotos: true,
        lastSyncedAt: true,
        smsCreditsUsed: true,
        smsCreditsLimit: true,
        emailCreditsUsed: true,
        emailCreditsLimit: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const response: ApiSuccessResponse<typeof updatedBusiness> = {
      success: true,
      data: updatedBusiness,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Update business API error:', error);

    if (error instanceof Error && error.message.includes('UNAUTHORIZED')) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiErrorResponse,
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Internal server error' },
      } satisfies ApiErrorResponse,
      { status: 500 }
    );
  }
}
