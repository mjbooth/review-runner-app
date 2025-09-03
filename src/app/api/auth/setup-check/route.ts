import { type NextRequest, NextResponse } from 'next/server';
import { getAuthHeaders } from '@/lib/auth-headers';
import { checkBusinessSetupStatus } from '@/lib/auth-setup-check';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/setup-check
 *
 * Called ONCE after successful authentication to check setup status.
 * Results should be cached client-side for the session duration.
 */
export async function POST(_request: NextRequest) {
  try {
    const authHeaders = await getAuthHeaders();
    const businessId = (authHeaders as { [key: string]: unknown })['x-business-id'] as string;

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: { message: 'Business ID not found' } },
        { status: 401 }
      );
    }

    // Check setup status (this queries the database)
    const setupStatus = await checkBusinessSetupStatus(businessId);

    // Log for monitoring
    logger.info({
      event: 'Setup status checked at login',
      businessId,
      isComplete: setupStatus.isComplete,
      hasCustomers: setupStatus.hasCustomers,
    });

    return NextResponse.json({
      success: true,
      data: setupStatus,
    });
  } catch (error) {
    logger.error({ event: 'Failed to check setup status', error });

    // Return success with defaults to avoid blocking user
    return NextResponse.json({
      success: true,
      data: {
        isComplete: true,
        hasBusinessProfile: true,
        hasCustomers: false,
        hasReviewRequests: false,
        hasBillingSetup: false,
      },
    });
  }
}
