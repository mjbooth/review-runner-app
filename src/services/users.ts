import { prisma } from '@/lib/prisma';
import type { User, OnboardingStatus, Prisma } from '@prisma/client';

export interface CreateUserParams {
  clerkUserId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string | null;
}

export interface UpdateUserParams {
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string | null;
  businessId?: string | null;
  onboardingStatus?: OnboardingStatus;
  onboardingStep?: number;
  onboardingCompletedSteps?: number[];
  onboardingCompletedAt?: Date | null;
  notificationPreferences?: Record<string, any>;
  uiPreferences?: Record<string, any>;
}

/**
 * Get or create a user from Clerk data
 */
export async function getOrCreateUser(params: CreateUserParams): Promise<User> {
  const { clerkUserId, email, firstName, lastName, imageUrl } = params;

  try {
    // Try to find existing user
    let user = await prisma.user.findUnique({
      where: { clerkUserId },
      include: { business: true },
    });

    if (!user) {
      // Create new user WITHOUT business - business will be created during onboarding
      user = await prisma.user.create({
        data: {
          clerkUserId,
          email,
          firstName,
          lastName,
          imageUrl,
          businessId: null, // No business yet
          onboardingStatus: 'IN_PROGRESS',
          onboardingStep: 0,
          onboardingCompletedSteps: [],
        },
        include: { business: true },
      });
    } else {
      // Update user info from Clerk if changed
      const updates: Prisma.UserUpdateInput = {};
      let hasUpdates = false;

      if (user.email !== email) {
        updates.email = email;
        hasUpdates = true;
      }
      if (user.firstName !== firstName) {
        updates.firstName = firstName;
        hasUpdates = true;
      }
      if (user.lastName !== lastName) {
        updates.lastName = lastName;
        hasUpdates = true;
      }
      if (user.imageUrl !== imageUrl) {
        updates.imageUrl = imageUrl;
        hasUpdates = true;
      }

      if (hasUpdates) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            ...updates,
            lastActiveAt: new Date(),
          },
          include: { business: true },
        });
      }
    }

    return user;
  } catch (error) {
    console.error('Error in getOrCreateUser:', error);
    throw error;
  }
}

/**
 * Get user by Clerk ID
 */
export async function getUserByClerkId(clerkUserId: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { clerkUserId },
    include: { business: true },
  });
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { email },
    include: { business: true },
  });
}

/**
 * Update user
 */
export async function updateUser(clerkUserId: string, updates: UpdateUserParams): Promise<User> {
  // Handle onboarding completed steps as JSON
  const data: Prisma.UserUpdateInput = {
    ...updates,
    lastActiveAt: new Date(),
  };

  if (updates.onboardingCompletedSteps) {
    data.onboardingCompletedSteps = updates.onboardingCompletedSteps;
  }

  if (updates.notificationPreferences) {
    data.notificationPreferences = updates.notificationPreferences;
  }

  if (updates.uiPreferences) {
    data.uiPreferences = updates.uiPreferences;
  }

  return prisma.user.update({
    where: { clerkUserId },
    data,
    include: { business: true },
  });
}

/**
 * Update user's onboarding status
 */
export async function updateUserOnboarding(
  clerkUserId: string,
  status: OnboardingStatus,
  step?: number,
  completedSteps?: number[]
): Promise<User> {
  const data: Prisma.UserUpdateInput = {
    onboardingStatus: status,
    lastActiveAt: new Date(),
  };

  if (step !== undefined) {
    data.onboardingStep = step;
  }

  if (completedSteps) {
    data.onboardingCompletedSteps = completedSteps;
  }

  // Set completion timestamp when status becomes COMPLETED
  if (status === 'COMPLETED') {
    data.onboardingCompletedAt = new Date();
  }

  return prisma.user.update({
    where: { clerkUserId },
    data,
    include: { business: true },
  });
}

/**
 * Complete user onboarding
 */
export async function completeUserOnboarding(clerkUserId: string): Promise<User> {
  return prisma.user.update({
    where: { clerkUserId },
    data: {
      onboardingStatus: 'COMPLETED',
      onboardingCompletedAt: new Date(),
      lastActiveAt: new Date(),
    },
    include: { business: true },
  });
}

/**
 * Link user to business
 */
export async function linkUserToBusiness(clerkUserId: string, businessId: string): Promise<User> {
  return prisma.user.update({
    where: { clerkUserId },
    data: {
      businessId,
      lastActiveAt: new Date(),
    },
    include: { business: true },
  });
}

/**
 * Update user's last active timestamp
 */
export async function updateUserActivity(clerkUserId: string): Promise<void> {
  await prisma.user.update({
    where: { clerkUserId },
    data: { lastActiveAt: new Date() },
    select: { id: true }, // Only select ID for performance
  });
}

/**
 * Check if user needs onboarding
 */
export async function userNeedsOnboarding(clerkUserId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { clerkUserId },
    select: { onboardingStatus: true },
  });

  if (!user) return true;
  return user.onboardingStatus !== 'COMPLETED' && user.onboardingStatus !== 'SKIPPED';
}
