import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware((auth, req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;
  
  console.log('Middleware processing:', pathname);
  
  // Skip auth for tracking URLs, webhooks, and auth pages
  if (
    pathname.startsWith('/r/') || 
    pathname.startsWith('/api/webhooks/') ||
    pathname.startsWith('/auth/')
  ) {
    console.log('Public route, skipping auth:', pathname);
    return;
  }
  
  console.log('Protected route, requiring auth:', pathname);
  auth().protect();
});

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