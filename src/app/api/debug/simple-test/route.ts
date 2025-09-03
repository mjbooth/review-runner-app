import { type NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  try {
    return NextResponse.json({
      success: true,
      message: 'Simple test endpoint working',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
