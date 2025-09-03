import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { completeUserOnboarding } from '@/services/users';

// POST /api/users/onboarding/complete - Mark onboarding as complete
export async function POST(req: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Complete user onboarding
    const updatedUser = await completeUserOnboarding(clerkUserId);

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error completing onboarding:', error);
    return NextResponse.json({ error: 'Failed to complete onboarding' }, { status: 500 });
  }
}
