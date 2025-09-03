import { type NextRequest, NextResponse } from 'next/server';
import { getBusinessContext } from '@/lib/auth-context';

export async function GET(_request: NextRequest) {
  try {
    // Testing auth connection
    const { businessId } = await getBusinessContext();
    // Auth successful

    return NextResponse.json({
      success: true,
      message: 'Auth test successful',
      businessId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Auth test failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
