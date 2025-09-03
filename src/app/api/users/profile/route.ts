import { type NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { updateUser, getUserByClerkId, getOrCreateUser } from '@/services/users';
import { z } from 'zod';

// GET /api/users/profile - Get current user's profile (with auto-creation fallback)
export async function GET(req: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user from database first
    let user = await getUserByClerkId(clerkUserId);

    // If user doesn't exist, create them (fallback for missing webhook)
    if (!user) {
      console.log(`User not found in database, creating user: ${clerkUserId}`);

      // Get Clerk user data
      const clerkUser = await currentUser();

      if (!clerkUser) {
        return NextResponse.json({ error: 'Clerk user not found' }, { status: 404 });
      }

      // Get primary email
      const primaryEmail = clerkUser.emailAddresses.find(
        e => e.id === clerkUser.primaryEmailAddressId
      );

      if (!primaryEmail) {
        return NextResponse.json({ error: 'No primary email found' }, { status: 400 });
      }

      // Create user with business (this will auto-create business)
      user = await getOrCreateUser({
        clerkUserId: clerkUser.id,
        email: primaryEmail.emailAddress,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl,
      });

      console.log(`User created successfully: ${user.id}, Business: ${user.businessId}`);
    }

    return NextResponse.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Error fetching/creating user profile:', error);
    return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 });
  }
}

// PATCH /api/users/profile - Update user profile
export async function PATCH(req: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await req.json();

    const updateSchema = z.object({
      firstName: z.string().min(1, 'First name is required').optional(),
      lastName: z.string().optional(),
      imageUrl: z.string().url().optional(),
      notificationPreferences: z.record(z.any()).optional(),
      uiPreferences: z.record(z.any()).optional(),
    });

    const validatedData = updateSchema.parse(body);

    // Get user record first, or create if doesn't exist (fallback for missing webhook)
    let user = await getUserByClerkId(clerkUserId);

    // If user doesn't exist, create them (fallback for missing webhook)
    if (!user) {
      console.log(`User not found during profile update, creating user: ${clerkUserId}`);

      // Get Clerk user data
      const clerkUser = await currentUser();

      if (!clerkUser) {
        return NextResponse.json({ error: 'Clerk user not found' }, { status: 404 });
      }

      // Get primary email
      const primaryEmail = clerkUser.emailAddresses.find(
        e => e.id === clerkUser.primaryEmailAddressId
      );

      if (!primaryEmail) {
        return NextResponse.json({ error: 'No primary email found' }, { status: 400 });
      }

      // Create user with business (this will auto-create business)
      user = await getOrCreateUser({
        clerkUserId: clerkUser.id,
        email: primaryEmail.emailAddress,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl,
      });

      console.log(`User created during profile update: ${user.id}, Business: ${user.businessId}`);
    }

    // Update user profile
    const updatedUser = await updateUser(clerkUserId, {
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      imageUrl: validatedData.imageUrl,
      notificationPreferences: validatedData.notificationPreferences,
      uiPreferences: validatedData.uiPreferences,
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error updating user profile:', error);
    return NextResponse.json({ error: 'Failed to update user profile' }, { status: 500 });
  }
}
