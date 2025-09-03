'use client';

interface OnboardingCompleteProps {
  businessData: any;
  onComplete: () => void;
}

export function OnboardingComplete({ businessData, onComplete }: OnboardingCompleteProps) {
  const hasGooglePlace = businessData?.googlePlaceId;

  return (
    <div className="p-8 text-center">
      <div className="mb-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-charcoal mb-2">Welcome to Review Runner! 🎉</h2>
        <p className="text-gray-600 mb-6">
          Your account is ready. Let's start collecting those reviews!
        </p>
      </div>

      <div className="bg-gray-50 rounded-lg p-6 mb-8">
        <h3 className="text-lg font-semibold text-charcoal mb-4">Your Business Setup</h3>
        <div className="text-left space-y-2">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm text-gray-700">Business profile created</span>
          </div>
          <div className="flex items-center">
            <svg
              className={`w-5 h-5 mr-3 ${hasGooglePlace ? 'text-green-500' : 'text-gray-400'}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              {hasGooglePlace ? (
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              ) : (
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              )}
            </svg>
            <span className={`text-sm ${hasGooglePlace ? 'text-gray-700' : 'text-gray-500'}`}>
              {hasGooglePlace ? 'Google Business connected' : 'Google Business not connected'}
            </span>
          </div>
          <div className="flex items-center">
            <svg className="w-5 h-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm text-gray-700">Ready to send review requests</span>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8 text-left">
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center mb-3">
            <svg
              className="w-5 h-5 text-primary-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
              />
            </svg>
          </div>
          <h4 className="font-medium text-charcoal mb-1">Add Customers</h4>
          <p className="text-sm text-gray-600">Import or manually add your customer contacts</p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center mb-3">
            <svg
              className="w-5 h-5 text-primary-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <h4 className="font-medium text-charcoal mb-1">Send Requests</h4>
          <p className="text-sm text-gray-600">Create personalized SMS and email campaigns</p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center mb-3">
            <svg
              className="w-5 h-5 text-primary-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <h4 className="font-medium text-charcoal mb-1">Track Results</h4>
          <p className="text-sm text-gray-600">Monitor delivery rates and review completion</p>
        </div>
      </div>

      <div className="space-y-4">
        <button
          onClick={onComplete}
          className="w-full bg-primary-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          Go to Dashboard
        </button>

        {!hasGooglePlace && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex">
              <svg
                className="w-5 h-5 text-yellow-400 mr-2 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <p className="text-sm font-medium text-yellow-800">
                  Connect your Google Business later
                </p>
                <p className="text-xs text-yellow-700 mt-1">
                  You can connect your Google Maps listing anytime in your account settings to
                  enable automated review tracking.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
