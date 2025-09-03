import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const photoName = searchParams.get('photoName') || searchParams.get('photoreference'); // Support both new and legacy parameter names
    const maxWidthPx = searchParams.get('maxWidthPx') || searchParams.get('maxwidth') || '400';
    const maxHeightPx = searchParams.get('maxHeightPx') || searchParams.get('maxheight');

    if (!photoName) {
      return NextResponse.json({ error: 'Photo name is required' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Google Places API key not configured' }, { status: 500 });
    }

    // Build the new Places API photo URL
    // Format: https://places.googleapis.com/v1/{photo_name}/media
    let photoUrl = `https://places.googleapis.com/v1/${photoName}/media`;

    // Add query parameters for sizing
    const urlParams = new URLSearchParams();
    if (maxHeightPx) {
      urlParams.append('maxHeightPx', maxHeightPx);
    } else {
      urlParams.append('maxWidthPx', maxWidthPx);
    }

    if (urlParams.toString()) {
      photoUrl += `?${urlParams.toString()}`;
    }

    // Fetching photo from New Places API

    // Fetch the photo using New Places API format
    const response = await fetch(photoUrl, {
      headers: {
        'X-Goog-Api-Key': apiKey,
      },
    });

    if (!response.ok) {
      console.error('Photo fetch failed:', {
        status: response.status,
        statusText: response.statusText,
        photoName: photoName.substring(0, 50) + '...',
      });
      return NextResponse.json(
        {
          error: `Failed to fetch photo: ${response.status} ${response.statusText}`,
        },
        { status: response.status }
      );
    }

    // Get the image data and content type
    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Photo fetched successfully

    // Return the image with proper headers
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      },
    });
  } catch (error) {
    console.error('Error fetching Google Places photo:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
