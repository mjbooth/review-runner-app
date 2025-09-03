import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  console.log('Custom middleware processing:', request.nextUrl.pathname);
  
  // For now, allow all requests to pass through
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files, but include ALL other paths
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Include tracking routes for middleware processing
    '/r/(.*)',
  ],
};