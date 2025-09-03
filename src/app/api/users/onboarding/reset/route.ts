import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { updateUserOnboarding } from '@/services/users';

// POST /api/users/onboarding/reset - Reset onboarding (development)
export async function POST(req: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Reset user onboarding to initial state
    const updatedUser = await updateUserOnboarding(clerkUserId, 'PENDING', 0, []);

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error resetting onboarding:', error);
    return NextResponse.json({ error: 'Failed to reset onboarding' }, { status: 500 });
  }
}
