import { type NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getOrCreateUser } from '@/services/users';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required' } },
        { status: 401 }
      );
    }

    // Get user and business data
    const user = await prisma.user.findUnique({
      where: { clerkUserId: userId },
      include: {
        business: {
          include: {
            customers: { take: 1 }, // Just check if any exist
            reviewRequests: { take: 1 }, // Just check if any exist
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'User not found' } },
        { status: 404 }
      );
    }

    // Check onboarding status
    const hasCustomers = user.business?.customers && user.business.customers.length > 0;
    const hasReviewRequests =
      user.business?.reviewRequests && user.business.reviewRequests.length > 0;
    const isOnboarded = user.onboardingStatus === 'COMPLETED';

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        userId: user.clerkUserId,
        businessId: user.businessId,
        status: user.onboardingStatus,
        currentStep: user.onboardingStep,
        completedSteps: user.onboardingCompletedSteps,
        businessData: user.business
          ? {
              name: user.business.name,
              phone: user.business.phone,
              address: user.business.address,
              website: user.business.website,
              placeId: user.business.placeId,
              googleMapsUrl: user.business.googleMapsUrl,
            }
          : null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        completedAt: user.onboardingCompletedAt?.toISOString(),
        isOnboarded,
        hasCustomers,
        hasReviewRequests,
      },
    });
  } catch (error) {
    logger.error({
      event: 'Failed to get onboarding status',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
    });

    return NextResponse.json(
      { success: false, error: { message: 'Failed to get onboarding status' } },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required' } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { currentStep, completedSteps, businessData, status } = body;

    // Get user record, or create if doesn't exist (fallback for missing webhook)
    let user = await prisma.user.findUnique({
      where: { clerkUserId: userId },
      include: { business: true },
    });

    if (!user) {
      console.log(`User not found during onboarding update, creating user: ${userId}`);

      // Get Clerk user data
      const clerkUser = await currentUser();

      if (!clerkUser) {
        return NextResponse.json(
          { success: false, error: { message: 'Clerk user not found' } },
          { status: 404 }
        );
      }

      // Get primary email
      const primaryEmail = clerkUser.emailAddresses.find(
        e => e.id === clerkUser.primaryEmailAddressId
      );

      if (!primaryEmail) {
        return NextResponse.json(
          { success: false, error: { message: 'No primary email found' } },
          { status: 400 }
        );
      }

      // Create user with business (this will auto-create business)
      user = await getOrCreateUser({
        clerkUserId: clerkUser.id,
        email: primaryEmail.emailAddress,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl,
      });

      console.log(`User created during onboarding: ${user.id}, Business: ${user.businessId}`);
    }

    // Update user onboarding data
    user = await prisma.user.update({
      where: { clerkUserId: userId },
      data: {
        onboardingStep: currentStep,
        onboardingCompletedSteps: completedSteps,
        onboardingStatus: status,
        ...(status === 'COMPLETED' && { onboardingCompletedAt: new Date() }),
      },
      include: { business: true },
    });

    // Create or update business data if provided
    if (businessData) {
      if (user.businessId) {
        // Update existing business
        await prisma.business.update({
          where: { id: user.businessId },
          data: {
            ...businessData,
          },
        });
      } else {
        // Create new business for user
        const business = await prisma.business.create({
          data: {
            clerkUserId: userId,
            email: user.email,
            smsCreditsLimit: 100,
            emailCreditsLimit: 500,
            smsCreditsUsed: 0,
            emailCreditsUsed: 0,
            isActive: true,
            ...businessData,
          },
        });

        // Link user to business
        const updatedUser = await prisma.user.update({
          where: { clerkUserId: userId },
          data: { businessId: business.id },
          include: { business: true },
        });

        console.log(`User linked to business: ${updatedUser.id} -> ${business.id}`);

        // Update user object for response
        user = updatedUser;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        userId: user.clerkUserId,
        businessId: user.businessId,
        status: user.onboardingStatus,
        currentStep: user.onboardingStep,
        completedSteps: user.onboardingCompletedSteps,
        businessData: user.business
          ? {
              name: user.business.name,
              phone: user.business.phone,
              address: user.business.address,
              website: user.business.website,
              placeId: user.business.placeId,
              googleMapsUrl: user.business.googleMapsUrl,
            }
          : null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        completedAt: user.onboardingCompletedAt?.toISOString(),
      },
    });
  } catch (error) {
    logger.error({
      event: 'Failed to update onboarding status',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
    });

    return NextResponse.json(
      { success: false, error: { message: 'Failed to update onboarding' } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required' } },
        { status: 401 }
      );
    }

    // Get user record, or create if doesn't exist (fallback for missing webhook)
    let user = await prisma.user.findUnique({
      where: { clerkUserId: userId },
    });

    if (!user) {
      console.log(`User not found during onboarding completion, creating user: ${userId}`);

      // Get Clerk user data
      const clerkUser = await currentUser();

      if (!clerkUser) {
        return NextResponse.json(
          { success: false, error: { message: 'Clerk user not found' } },
          { status: 404 }
        );
      }

      // Get primary email
      const primaryEmail = clerkUser.emailAddresses.find(
        e => e.id === clerkUser.primaryEmailAddressId
      );

      if (!primaryEmail) {
        return NextResponse.json(
          { success: false, error: { message: 'No primary email found' } },
          { status: 400 }
        );
      }

      // Create user with business (this will auto-create business)
      user = await getOrCreateUser({
        clerkUserId: clerkUser.id,
        email: primaryEmail.emailAddress,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl,
      });

      console.log(
        `User created during onboarding completion: ${user.id}, Business: ${user.businessId}`
      );
    }

    // Complete onboarding
    user = await prisma.user.update({
      where: { clerkUserId: userId },
      data: {
        onboardingStatus: 'COMPLETED',
        onboardingCompletedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        userId: user.clerkUserId,
        businessId: user.businessId,
        status: user.onboardingStatus,
        currentStep: user.onboardingStep,
        completedSteps: user.onboardingCompletedSteps,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        completedAt: user.onboardingCompletedAt?.toISOString(),
      },
    });
  } catch (error) {
    logger.error({
      event: 'Failed to complete onboarding',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
    });

    return NextResponse.json(
      { success: false, error: { message: 'Failed to complete onboarding' } },
      { status: 500 }
    );
  }
}
