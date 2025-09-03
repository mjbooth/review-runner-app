'use client';

import React from 'react';
import {
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Search,
  MapPin,
  Wifi,
  WifiOff,
} from '@/components/ui/icons';
import { cn } from '@/lib/utils';

// Error type definitions
export type ErrorType =
  | 'business-not-found'
  | 'invalid-url'
  | 'google-places-unavailable'
  | 'network-error'
  | 'search-failed'
  | 'general-error';

export interface BusinessError {
  type: ErrorType;
  message: string;
  details?: string;
  code?: string;
  canRetry?: boolean;
}

interface ErrorStateProps {
  error: BusinessError;
  onRetry?: () => void;
  onManualEntry?: () => void;
  className?: string;
}

export function ErrorState({ error, onRetry, onManualEntry, className }: ErrorStateProps) {
  switch (error.type) {
    case 'business-not-found':
      return (
        <BusinessNotFoundError
          error={error}
          onRetry={onRetry}
          onManualEntry={onManualEntry}
          className={className}
        />
      );
    case 'invalid-url':
      return <InvalidUrlError error={error} onRetry={onRetry} className={className} />;
    case 'google-places-unavailable':
      return (
        <GooglePlacesUnavailableError
          error={error}
          onRetry={onRetry}
          onManualEntry={onManualEntry}
          className={className}
        />
      );
    case 'network-error':
      return <NetworkError error={error} onRetry={onRetry} className={className} />;
    case 'search-failed':
      return (
        <SearchFailedError
          error={error}
          onRetry={onRetry}
          onManualEntry={onManualEntry}
          className={className}
        />
      );
    default:
      return (
        <GeneralError
          error={error}
          onRetry={onRetry}
          onManualEntry={onManualEntry}
          className={className}
        />
      );
  }
}

// Business Not Found Error
function BusinessNotFoundError({ error, onRetry, onManualEntry, className }: ErrorStateProps) {
  return (
    <div className={cn('bg-red-50 border border-red-200 rounded-lg p-6 space-y-4', className)}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <Search className="w-6 h-6 text-red-500" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-900">Business Not Found</h3>
          <p className="text-sm text-red-700 mt-1">
            {error.message || "We couldn't find any businesses matching your search."}
          </p>
          {error.details && <p className="text-xs text-red-600 mt-2">{error.details}</p>}
        </div>
      </div>

      <div className="bg-red-25 rounded-md p-3">
        <h4 className="text-xs font-medium text-red-800 mb-2">Try these suggestions:</h4>
        <ul className="text-xs text-red-700 space-y-1">
          <li>• Check your spelling and try again</li>
          <li>• Try searching with just your business name</li>
          <li>• Use a Google Maps URL instead</li>
          <li>• Enter your business details manually</li>
        </ul>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 focus:outline-none focus:border-red-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Try Again</span>
          </button>
        )}
        {onManualEntry && (
          <button
            type="button"
            onClick={onManualEntry}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-white text-red-700 text-sm font-medium rounded-md border border-red-300 hover:bg-red-50 focus:outline-none focus:border-red-500 transition-colors"
          >
            <MapPin className="w-4 h-4" />
            <span>Enter Manually</span>
          </button>
        )}
      </div>
    </div>
  );
}

// Invalid URL Error
function InvalidUrlError({ error, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn('bg-red-50 border border-red-200 rounded-lg p-6 space-y-4', className)}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <ExternalLink className="w-6 h-6 text-red-500" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-900">Invalid Google Maps URL</h3>
          <p className="text-sm text-red-700 mt-1">
            {error.message || 'The URL you entered is not a valid Google Maps business URL.'}
          </p>
          {error.details && <p className="text-xs text-red-600 mt-2">{error.details}</p>}
        </div>
      </div>

      <div className="bg-red-25 rounded-md p-3">
        <h4 className="text-xs font-medium text-red-800 mb-2">Valid URL formats:</h4>
        <div className="space-y-2">
          <div className="text-xs text-red-700">
            <code className="bg-white px-2 py-1 rounded text-xs">
              https://www.google.com/maps/place/Business+Name
            </code>
          </div>
          <div className="text-xs text-red-700">
            <code className="bg-white px-2 py-1 rounded text-xs">
              https://maps.google.com/business-url
            </code>
          </div>
        </div>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 focus:outline-none focus:border-red-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Try Again</span>
        </button>
      )}
    </div>
  );
}

// Google Places API Unavailable Error
function GooglePlacesUnavailableError({
  error,
  onRetry,
  onManualEntry,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn('bg-red-50 border border-red-200 rounded-lg p-6 space-y-4', className)}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-900">Google Places Service Unavailable</h3>
          <p className="text-sm text-red-700 mt-1">
            {error.message ||
              'The Google Places service is currently unavailable. Please try again later.'}
          </p>
          {error.details && <p className="text-xs text-red-600 mt-2">{error.details}</p>}
        </div>
      </div>

      <div className="bg-red-25 rounded-md p-3">
        <p className="text-xs text-red-700">
          This is usually a temporary issue. You can try again in a few moments or enter your
          business details manually to continue.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 focus:outline-none focus:border-red-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Try Again</span>
          </button>
        )}
        {onManualEntry && (
          <button
            type="button"
            onClick={onManualEntry}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-white text-red-700 text-sm font-medium rounded-md border border-red-300 hover:bg-red-50 focus:outline-none focus:border-red-500 transition-colors"
          >
            <MapPin className="w-4 h-4" />
            <span>Enter Manually</span>
          </button>
        )}
      </div>
    </div>
  );
}

// Network Error
function NetworkError({ error, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn('bg-red-50 border border-red-200 rounded-lg p-6 space-y-4', className)}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <WifiOff className="w-6 h-6 text-red-500" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-900">Connection Problem</h3>
          <p className="text-sm text-red-700 mt-1">
            {error.message ||
              'Unable to connect to the service. Please check your internet connection.'}
          </p>
          {error.details && <p className="text-xs text-red-600 mt-2">{error.details}</p>}
        </div>
      </div>

      <div className="bg-red-25 rounded-md p-3">
        <p className="text-xs text-red-700">
          Please check your internet connection and try again. If the problem persists, our servers
          may be experiencing issues.
        </p>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 focus:outline-none focus:border-red-700 transition-colors"
        >
          <Wifi className="w-4 h-4" />
          <span>Retry Connection</span>
        </button>
      )}
    </div>
  );
}

// Search Failed Error
function SearchFailedError({ error, onRetry, onManualEntry, className }: ErrorStateProps) {
  return (
    <div className={cn('bg-red-50 border border-red-200 rounded-lg p-6 space-y-4', className)}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-900">Search Failed</h3>
          <p className="text-sm text-red-700 mt-1">
            {error.message || 'Something went wrong while searching for your business.'}
          </p>
          {error.details && <p className="text-xs text-red-600 mt-2">{error.details}</p>}
        </div>
      </div>

      <div className="bg-red-25 rounded-md p-3">
        <p className="text-xs text-red-700">
          This could be a temporary issue. Please try searching again or enter your business details
          manually.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 focus:outline-none focus:border-red-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Try Search Again</span>
          </button>
        )}
        {onManualEntry && (
          <button
            type="button"
            onClick={onManualEntry}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-white text-red-700 text-sm font-medium rounded-md border border-red-300 hover:bg-red-50 focus:outline-none focus:border-red-500 transition-colors"
          >
            <MapPin className="w-4 h-4" />
            <span>Enter Manually</span>
          </button>
        )}
      </div>
    </div>
  );
}

// General Error Fallback
function GeneralError({ error, onRetry, onManualEntry, className }: ErrorStateProps) {
  return (
    <div className={cn('bg-red-50 border border-red-200 rounded-lg p-6 space-y-4', className)}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-900">Something Went Wrong</h3>
          <p className="text-sm text-red-700 mt-1">
            {error.message || 'An unexpected error occurred while processing your request.'}
          </p>
          {error.details && <p className="text-xs text-red-600 mt-2">{error.details}</p>}
          {error.code && (
            <p className="text-xs text-red-500 mt-1 font-mono">Error Code: {error.code}</p>
          )}
        </div>
      </div>

      <div className="bg-red-25 rounded-md p-3">
        <p className="text-xs text-red-700">
          If this problem persists, please contact our support team for assistance.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {onRetry && error.canRetry !== false && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 focus:outline-none focus:border-red-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Try Again</span>
          </button>
        )}
        {onManualEntry && (
          <button
            type="button"
            onClick={onManualEntry}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-white text-red-700 text-sm font-medium rounded-md border border-red-300 hover:bg-red-50 focus:outline-none focus:border-red-500 transition-colors"
          >
            <MapPin className="w-4 h-4" />
            <span>Continue Manually</span>
          </button>
        )}
      </div>
    </div>
  );
}

// Recovery state for when operations are retrying
interface RecoveryStateProps {
  message?: string;
  className?: string;
}

export function RecoveryState({ message = 'Retrying...', className }: RecoveryStateProps) {
  return (
    <div className={cn('bg-yellow-50 border border-yellow-200 rounded-lg p-4', className)}>
      <div className="flex items-center space-x-3">
        <RefreshCw className="w-5 h-5 text-yellow-600 animate-spin" />
        <div>
          <p className="text-sm font-medium text-yellow-800">{message}</p>
          <p className="text-xs text-yellow-700 mt-1">Please wait while we try again...</p>
        </div>
      </div>
    </div>
  );
}
