'use client';

import React, { useState } from 'react';

interface DataSyncPanelProps {
  lastSyncTime: Date | null;
  syncing: boolean;
  syncError: string | null;
  onRefresh: () => Promise<void>;
}

export function DataSyncPanel({ lastSyncTime, syncing, syncError, onRefresh }: DataSyncPanelProps) {
  const [showDetails, setShowDetails] = useState(false);

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Never';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  const getSyncStatus = () => {
    if (syncing) return { text: 'Syncing...', color: 'blue', icon: 'loading' };
    if (syncError) return { text: 'Sync Error', color: 'red', icon: 'error' };
    if (!lastSyncTime) return { text: 'Not Synced', color: 'yellow', icon: 'warning' };

    const hoursSinceSync = (new Date().getTime() - lastSyncTime.getTime()) / (1000 * 60 * 60);
    if (hoursSinceSync > 24) return { text: 'Needs Update', color: 'yellow', icon: 'warning' };

    return { text: 'Up to Date', color: 'green', icon: 'check' };
  };

  const status = getSyncStatus();

  const getIconForStatus = (iconType: string) => {
    switch (iconType) {
      case 'loading':
        return (
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        );
      case 'error':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        );
      case 'check':
      default:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        );
    }
  };

  const getStatusColor = (color: string) => {
    const colors = {
      green: 'text-green-700 bg-green-100 border-green-300',
      blue: 'text-blue-700 bg-blue-100 border-blue-300',
      yellow: 'text-yellow-700 bg-yellow-100 border-yellow-300',
      red: 'text-red-700 bg-red-100 border-red-300',
    };
    return colors[color as keyof typeof colors] || colors.green;
  };

  return (
    <div className="relative">
      {/* Main Sync Button */}
      <div className="flex items-center space-x-3">
        <div
          className={`flex items-center px-3 py-2 rounded-lg border ${getStatusColor(status.color)}`}
        >
          {getIconForStatus(status.icon)}
          <span className="ml-2 text-sm font-medium">{status.text}</span>
        </div>

        <button
          onClick={onRefresh}
          disabled={syncing}
          className="flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {syncing ? 'Syncing...' : 'Refresh'}
        </button>

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          title="View sync details"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
      </div>

      {/* Details Panel */}
      {showDetails && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-10">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Data Sync Status</h3>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Last Successful Sync:</span>
                <span className="font-medium text-gray-900">{formatLastSync(lastSyncTime)}</span>
              </div>

              {lastSyncTime && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Full Sync Time:</span>
                  <span className="font-medium text-gray-900">{lastSyncTime.toLocaleString()}</span>
                </div>
              )}

              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Sync Status:</span>
                <span
                  className={`font-medium ${
                    status.color === 'green'
                      ? 'text-green-700'
                      : status.color === 'blue'
                        ? 'text-blue-700'
                        : status.color === 'yellow'
                          ? 'text-yellow-700'
                          : 'text-red-700'
                  }`}
                >
                  {status.text}
                </span>
              </div>
            </div>

            {syncError && (
              <div className="pt-2 border-t border-gray-200">
                <div className="text-sm text-gray-600 mb-1">Last Error:</div>
                <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{syncError}</div>
              </div>
            )}

            <div className="pt-2 border-t border-gray-200">
              <div className="text-xs text-gray-500">
                <div className="mb-2">
                  <strong>What gets synced:</strong>
                </div>
                <ul className="list-disc list-inside space-y-1">
                  <li>Business information & contact details</li>
                  <li>Current review statistics & ratings</li>
                  <li>Business hours & operational status</li>
                  <li>Photos & business categories</li>
                </ul>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-200">
              <div className="text-xs text-gray-500">
                <div className="mb-1">
                  <strong>API Usage:</strong>
                </div>
                <div className="flex justify-between">
                  <span>Google Places API calls today:</span>
                  <span>3/100</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                  <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: '3%' }}></div>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  onRefresh();
                  setShowDetails(false);
                }}
                disabled={syncing}
                className="w-full px-3 py-2 bg-forgedorange-600 text-white rounded-lg hover:bg-forgedorange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {syncing ? 'Syncing...' : 'Refresh Google Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
