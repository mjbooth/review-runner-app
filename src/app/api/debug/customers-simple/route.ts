import { type NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'Simple test working',
    timestamp: new Date().toISOString(),
  });
}
