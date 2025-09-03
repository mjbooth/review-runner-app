import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest) {
  try {
    // Testing database connection

    // Simple database test
    const customerCount = await prisma.customer.count();
    // Database test successful

    return NextResponse.json({
      success: true,
      message: 'Database test successful',
      customerCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Database test failed:', error);
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
