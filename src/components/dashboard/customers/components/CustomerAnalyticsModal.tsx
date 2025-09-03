'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { type Customer } from '../types';
import {
  BarChart3,
  TrendingUp,
  Mail,
  MessageSquare,
  Clock,
  Target,
  CheckCircle,
  XCircle,
  Eye,
  Calendar,
  User,
} from '@/components/ui/icons';

interface CustomerAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
}

interface AnalyticsData {
  totalRequests: number;
  emailRequests: number;
  smsRequests: number;
  deliveredRequests: number;
  clickedRequests: number;
  failedRequests: number;
  completedRequests: number;
  lastRequestDate: string | null;
  firstRequestDate: string | null;
  averageResponseTime: number; // in hours
  deliveryRate: number;
  clickRate: number;
  completionRate: number;
  requestHistory: {
    id: string;
    channel: string;
    status: string;
    sentAt: string;
    deliveredAt?: string;
    clickedAt?: string;
    completedAt?: string;
    template: string;
  }[];
}

export function CustomerAnalyticsModal({ isOpen, onClose, customer }: CustomerAnalyticsModalProps) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  useEffect(() => {
    if (isOpen && customer) {
      loadAnalytics();
    }
  }, [isOpen, customer, timeRange]);

  const loadAnalytics = async () => {
    if (!customer) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/customers/${customer.id}/analytics?timeRange=${timeRange}`
      );
      const data = await response.json();

      if (data.success) {
        setAnalytics(data.data);
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPercentage = (value: number) => {
    return `${Math.round(value * 100)}%`;
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'delivered':
      case 'sent':
        return 'text-green-600 bg-green-100';
      case 'clicked':
      case 'completed':
        return 'text-blue-600 bg-blue-100';
      case 'failed':
      case 'bounced':
        return 'text-red-600 bg-red-100';
      case 'queued':
      case 'scheduled':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'delivered':
      case 'sent':
        return <CheckCircle className="w-3 h-3" />;
      case 'clicked':
      case 'completed':
        return <Eye className="w-3 h-3" />;
      case 'failed':
      case 'bounced':
        return <XCircle className="w-3 h-3" />;
      case 'queued':
      case 'scheduled':
        return <Clock className="w-3 h-3" />;
      default:
        return <Target className="w-3 h-3" />;
    }
  };

  if (!customer) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Customer Analytics" size="xl">
      <div className="space-y-6">
        {/* Customer Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">
                {customer.firstName} {customer.lastName}
              </h3>
              <p className="text-sm text-gray-500">{customer.email}</p>
            </div>
          </div>

          {/* Time Range Selector */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            {[
              { value: '7d', label: '7 days' },
              { value: '30d', label: '30 days' },
              { value: '90d', label: '90 days' },
              { value: 'all', label: 'All time' },
            ].map(option => (
              <button
                key={option.value}
                onClick={() => setTimeRange(option.value as any)}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  timeRange === option.value
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-charcoal'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading analytics...</span>
          </div>
        ) : analytics ? (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Target className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-600">Total Requests</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-1">{analytics.totalRequests}</p>
              </div>

              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">Delivery Rate</span>
                </div>
                <p className="text-2xl font-bold text-green-900 mt-1">
                  {formatPercentage(analytics.deliveryRate)}
                </p>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Eye className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-600">Click Rate</span>
                </div>
                <p className="text-2xl font-bold text-blue-900 mt-1">
                  {formatPercentage(analytics.clickRate)}
                </p>
              </div>

              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-600">Completion Rate</span>
                </div>
                <p className="text-2xl font-bold text-purple-900 mt-1">
                  {formatPercentage(analytics.completionRate)}
                </p>
              </div>
            </div>

            {/* Channel Breakdown */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-4 flex items-center space-x-2">
                <BarChart3 className="w-4 h-4" />
                <span>Channel Breakdown</span>
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Mail className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-900">Email</span>
                  </div>
                  <span className="text-lg font-bold text-green-900">
                    {analytics.emailRequests}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <MessageSquare className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">SMS</span>
                  </div>
                  <span className="text-lg font-bold text-blue-900">{analytics.smsRequests}</span>
                </div>
              </div>
            </div>

            {/* Request History */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-4 flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>Request History</span>
              </h4>

              {analytics.requestHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p>No requests in selected time period</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {analytics.requestHistory.map(request => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}
                        >
                          {getStatusIcon(request.status)}
                          <span>{request.status}</span>
                        </div>

                        <div className="flex items-center space-x-2">
                          {request.channel === 'EMAIL' ? (
                            <Mail className="w-3 h-3 text-gray-500" />
                          ) : (
                            <MessageSquare className="w-3 h-3 text-gray-500" />
                          )}
                          <span className="text-sm text-gray-600">{request.channel}</span>
                        </div>

                        <span className="text-sm text-gray-600">{request.template}</span>
                      </div>

                      <div className="text-xs text-gray-500">{formatDate(request.sentAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Additional Metrics */}
            {analytics.averageResponseTime > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Additional Metrics</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Average Response Time:</span>
                    <span className="ml-2 font-medium">
                      {Math.round(analytics.averageResponseTime)} hours
                    </span>
                  </div>
                  {analytics.firstRequestDate && (
                    <div>
                      <span className="text-gray-600">First Request:</span>
                      <span className="ml-2 font-medium">
                        {formatDate(analytics.firstRequestDate)}
                      </span>
                    </div>
                  )}
                  {analytics.lastRequestDate && (
                    <div>
                      <span className="text-gray-600">Last Request:</span>
                      <span className="ml-2 font-medium">
                        {formatDate(analytics.lastRequestDate)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>No analytics data available</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-charcoal transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
