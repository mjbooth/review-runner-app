import { type NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Forward the request to the backend API
    const token = request.headers.get('authorization');

    const response = await fetch(
      `${process.env.API_BASE_URL || 'http://localhost:3000'}/api/businesses/refresh-google-data`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token || '',
        },
      }
    );

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error forwarding refresh Google data request:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'PROXY_ERROR',
          message: 'Failed to forward request to backend API',
        },
      },
      { status: 500 }
    );
  }
}
