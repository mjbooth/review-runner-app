import { NextRequest, NextResponse } from 'next/server';

// Simple test route that should be publicly accessible
export async function GET(request: NextRequest) {
  return NextResponse.json({ message: 'Public route working!', timestamp: new Date().toISOString() });
}