'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';

interface GooglePlaceConnectionProps {
  businessData: any;
  onComplete: (business: any) => void;
  onSkip: (business: any) => void;
}

export function GooglePlaceConnection({
  businessData,
  onComplete,
  onSkip,
}: GooglePlaceConnectionProps) {
  const { getToken } = useAuth();
  const [googlePlaceUrl, setGooglePlaceUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setGooglePlaceUrl(url);
    setPreviewData(null);
    setError(null);

    // Auto-preview if URL looks like a Google Maps URL
    if (url.includes('maps.google.com') || url.includes('goo.gl/maps')) {
      handlePreview(url);
    }
  };

  const handlePreview = async (url?: string) => {
    const urlToPreview = url || googlePlaceUrl;
    if (!urlToPreview.trim()) return;

    setIsPreviewLoading(true);
    setError(null);

    try {
      const token = await getToken();

      // Extract place ID and get details
      const response = await fetch('/api/businesses/connect-place', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          googlePlaceUrl: urlToPreview,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setPreviewData(result.data);
      } else {
        setError(result.error?.message || 'Could not extract business details from URL');
      }
    } catch (err) {
      setError('Failed to connect to Google Places');
      console.error('Google Places connection error:', err);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!previewData) {
      await handlePreview();
      return;
    }

    setIsLoading(true);
    onComplete(previewData);
  };

  const handleSkip = () => {
    onSkip(businessData);
  };

  return (
    <div className="p-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Connect Your Google Business</h2>
        <p className="text-gray-600">
          Connect your Google Maps listing to automatically populate your business details and
          enable review tracking.
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <label htmlFor="googlePlaceUrl" className="block text-sm font-medium text-gray-700 mb-2">
            Google Maps URL
          </label>
          <div className="relative">
            <input
              type="url"
              id="googlePlaceUrl"
              value={googlePlaceUrl}
              onChange={handleUrlChange}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 pr-12 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="https://maps.google.com/..."
            />
            {isPreviewLoading && (
              <div className="absolute right-3 top-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
              </div>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Copy and paste the URL from your Google Maps business listing
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex">
              <svg
                className="w-5 h-5 text-red-400 mr-2 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <p className="text-sm text-red-800">{error}</p>
                <p className="text-xs text-red-600 mt-1">
                  Make sure you're using a valid Google Maps business URL
                </p>
              </div>
            </div>
          </div>
        )}

        {previewData && (
          <div className="border border-green-200 bg-green-50 rounded-lg p-4">
            <div className="flex">
              <svg
                className="w-5 h-5 text-green-400 mr-2 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-green-800">Business Details Found</h3>
                <div className="mt-2 text-sm text-green-700">
                  <p>
                    <strong>Name:</strong> {previewData.name}
                  </p>
                  <p>
                    <strong>Address:</strong> {previewData.address}
                  </p>
                  {previewData.phone && (
                    <p>
                      <strong>Phone:</strong> {previewData.phone}
                    </p>
                  )}
                  {previewData.website && (
                    <p>
                      <strong>Website:</strong> {previewData.website}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">
            How to find your Google Maps URL:
          </h3>
          <ol className="text-sm text-gray-600 space-y-1">
            <li>1. Go to Google Maps and search for your business</li>
            <li>2. Click on your business listing</li>
            <li>3. Click the "Share" button in the business panel</li>
            <li>4. Copy the "Share link" URL (recommended)</li>
            <li className="text-gray-500">Alternative: Copy URL from browser address bar</li>
          </ol>

          <div className="mt-3 p-2 bg-blue-50 rounded border-l-4 border-blue-200">
            <p className="text-xs text-blue-700">
              💡 <strong>Tip:</strong> Share links work better than browser URLs. Look for URLs
              containing "place_id" or business names.
            </p>
          </div>
        </div>

        <div className="flex space-x-4 pt-4">
          <button
            type="button"
            onClick={handleSkip}
            className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Skip for Now
          </button>

          <button
            type="button"
            onClick={handleConnect}
            disabled={!googlePlaceUrl.trim() || isLoading || isPreviewLoading}
            className="flex-1 bg-primary-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Connecting...
              </>
            ) : previewData ? (
              'Continue with This Business'
            ) : (
              'Connect Business'
            )}
          </button>
        </div>

        <div className="text-center">
          <p className="text-sm text-gray-500">
            You can connect your Google Business listing later in your account settings
          </p>
        </div>
      </div>
    </div>
  );
}
