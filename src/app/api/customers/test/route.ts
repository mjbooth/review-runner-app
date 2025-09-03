import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Simple test endpoint to check database connection
export async function GET() {
  try {
    const customerCount = await prisma.customer.count();
    const businessCount = await prisma.business.count();

    return NextResponse.json({
      success: true,
      data: {
        customerCount,
        businessCount,
        message: 'Database connection working',
      },
    });
  } catch (error) {
    console.error('Database test error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Database connection failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}
