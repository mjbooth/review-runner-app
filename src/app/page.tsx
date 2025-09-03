// This page acts as a fallback but should never be seen due to middleware redirects
// Users are automatically redirected to /auth/sign-in or /dashboard
export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Redirecting...</h1>
        <p className="text-gray-600 mt-2">Please wait while we redirect you.</p>
      </div>
    </div>
  );
}
