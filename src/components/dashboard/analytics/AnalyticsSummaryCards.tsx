'use client';

import { useState, useEffect } from 'react';
import { addAuthHeaders } from '@/lib/auth-headers';

interface AnalyticsData {
  summary: {
    totalSent: number;
    totalClicked: number;
    clickThroughRate: number;
  };
  channelBreakdown: Array<{
    channel: string;
    totalSent: number;
    totalClicked: number;
    clickThroughRate: number;
  }>;
  dateRange: {
    startDate: string;
    endDate: string;
    days: number;
  };
}

interface AnalyticsSummaryCardsProps {
  className?: string;
}

export function AnalyticsSummaryCards({ className }: AnalyticsSummaryCardsProps) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<number>(30);

  useEffect(() => {
    fetchAnalytics();
  }, [selectedPeriod]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/analytics/click-through-rates?days=${selectedPeriod}`, {
        method: 'GET',
        headers: addAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || `API error: ${response.status}`);
      }

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch analytics');
      }

      setAnalytics(data.data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 ${className || ''}`}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-gray-200 animate-pulse">
            <div className="h-4 bg-gray-200 rounded mb-2"></div>
            <div className="h-8 bg-gray-200 rounded mb-4"></div>
            <div className="h-3 bg-gray-200 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-6 ${className || ''}`}>
        <div className="flex items-center space-x-3">
          <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <h3 className="text-sm font-medium text-red-800">Analytics Error</h3>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        </div>
        <button
          onClick={fetchAnalytics}
          className="mt-4 px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  const { summary, channelBreakdown } = analytics;

  const emailStats = channelBreakdown.find(ch => ch.channel === 'EMAIL');
  const smsStats = channelBreakdown.find(ch => ch.channel === 'SMS');

  return (
    <div className={className || ''}>
      {/* Period Selector */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Analytics Overview</h2>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-forgedorange-500 focus:border-forgedorange-500"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Overall Click-Through Rate */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-600">Click-Through Rate</h3>
            <div className="p-2 bg-forgedorange-100 rounded-lg">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5 text-forgedorange-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                />
              </svg>
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 mb-1">
            {summary.clickThroughRate.toFixed(1)}%
          </div>
          <p className="text-sm text-gray-600">
            {summary.totalClicked} of {summary.totalSent} clicked
          </p>
        </div>

        {/* Email Performance */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-600">Email Performance</h3>
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 mb-1">
            {emailStats ? emailStats.clickThroughRate.toFixed(1) : '0.0'}%
          </div>
          <p className="text-sm text-gray-600">
            {emailStats ? `${emailStats.totalClicked} of ${emailStats.totalSent} clicked` : 'No email data'}
          </p>
        </div>

        {/* SMS Performance */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-600">SMS Performance</h3>
            <div className="p-2 bg-green-100 rounded-lg">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 mb-1">
            {smsStats ? smsStats.clickThroughRate.toFixed(1) : '0.0'}%
          </div>
          <p className="text-sm text-gray-600">
            {smsStats ? `${smsStats.totalClicked} of ${smsStats.totalSent} clicked` : 'No SMS data'}
          </p>
        </div>
      </div>

      {/* Additional Stats */}
      <div className="mt-6 bg-gray-50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Performance Insights</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Total Messages Sent</h4>
            <div className="text-3xl font-bold text-slate-900">{summary.totalSent}</div>
            <div className="text-sm text-gray-600 mt-1">
              Last {selectedPeriod} days
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Total Clicks</h4>
            <div className="text-3xl font-bold text-slate-900">{summary.totalClicked}</div>
            <div className="text-sm text-gray-600 mt-1">
              Across all channels
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}