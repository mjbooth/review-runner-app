import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/',
  '/r(.*)',
  '/api/webhooks(.*)', 
  '/auth(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  console.log('🔥 Clerk middleware processing:', req.nextUrl.pathname);
  
  if (!isPublicRoute(req)) {
    console.log('🔒 Protecting route:', req.nextUrl.pathname);
    await auth.protect();
  } else {
    console.log('🌍 Public route, allowing access:', req.nextUrl.pathname);
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Include API routes
    '/(api|trpc)(.*)',
  ],
};