import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/auth/sign-in(.*)',
  '/auth/sign-up(.*)',
  '/api/webhooks(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth();
  const { pathname } = request.nextUrl;

  // If user is on the index page
  if (pathname === '/') {
    if (userId) {
      // Logged in users go to dashboard
      return NextResponse.redirect(new URL('/dashboard', request.url));
    } else {
      // Not logged in users go to sign-in
      return NextResponse.redirect(new URL('/auth/sign-in', request.url));
    }
  }

  // If authenticated user tries to access auth pages, redirect to dashboard
  if (userId && (pathname.startsWith('/auth/sign-in') || pathname.startsWith('/auth/sign-up'))) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Protect all routes except public ones
  if (!isPublicRoute(request) && !userId) {
    // For API routes, return JSON error instead of redirecting
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        },
        { status: 401 }
      );
    }

    // For regular pages, redirect to sign-in
    return NextResponse.redirect(new URL('/auth/sign-in', request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
