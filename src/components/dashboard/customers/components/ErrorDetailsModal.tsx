'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { type Customer } from '../types';
import {
  AlertTriangle,
  XCircle,
  Clock,
  RefreshCw,
  Mail,
  MessageSquare,
  ExternalLink,
  Copy,
  User,
  Calendar,
  AlertCircle,
} from '@/components/ui/icons';

interface ErrorDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  onRetry?: () => void;
}

interface ErrorDetail {
  id: string;
  type:
    | 'delivery_failed'
    | 'send_failed'
    | 'bounce'
    | 'spam'
    | 'network_error'
    | 'rate_limit'
    | 'auth_failed'
    | 'validation_failed';
  message: string;
  technicalDetails: string;
  timestamp: string;
  channel: 'EMAIL' | 'SMS';
  requestId: string;
  errorCode?: string;
  retryCount: number;
  canRetry: boolean;
  resolution?: string;
  metadata?: {
    twilioErrorCode?: string;
    sendgridErrorCode?: string;
    httpStatusCode?: number;
    recipientResponse?: string;
    bounceType?: string;
    spamScore?: number;
    provider?: string;
  };
}

export function ErrorDetailsModal({ isOpen, onClose, customer, onRetry }: ErrorDetailsModalProps) {
  const [errors, setErrors] = useState<ErrorDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [selectedError, setSelectedError] = useState<ErrorDetail | null>(null);

  useEffect(() => {
    if (isOpen && customer) {
      loadErrorDetails();
    }
  }, [isOpen, customer]);

  const loadErrorDetails = async () => {
    if (!customer) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/customers/${customer.id}/errors`);
      const data = await response.json();

      if (data.success) {
        setErrors(data.data || []);
        if (data.data?.length > 0) {
          setSelectedError(data.data[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load error details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRetryRequest = async (errorId: string) => {
    setRetrying(errorId);
    try {
      const response = await fetch(`/api/review-requests/retry/${errorId}`, {
        method: 'POST',
      });

      if (response.ok) {
        await loadErrorDetails();
        onRetry?.();
        showNotification('Request retry initiated', 'success');
      } else {
        showNotification('Failed to retry request', 'error');
      }
    } catch (error) {
      console.error('Failed to retry request:', error);
      showNotification('Failed to retry request', 'error');
    } finally {
      setRetrying(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showNotification('Copied to clipboard', 'success');
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-white max-w-sm ${
      type === 'success' ? 'bg-green-600' : 'bg-red-600'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };

  const getErrorIcon = (type: string) => {
    switch (type) {
      case 'delivery_failed':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'send_failed':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case 'bounce':
        return <RefreshCw className="w-5 h-5 text-orange-600" />;
      case 'spam':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'network_error':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case 'rate_limit':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      case 'auth_failed':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'validation_failed':
        return <AlertCircle className="w-5 h-5 text-orange-600" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-gray-600" />;
    }
  };

  const getErrorColorClasses = (type: string) => {
    switch (type) {
      case 'delivery_failed':
      case 'send_failed':
      case 'auth_failed':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'bounce':
      case 'validation_failed':
        return 'bg-orange-50 border-orange-200 text-orange-800';
      case 'spam':
      case 'rate_limit':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'network_error':
        return 'bg-gray-50 border-gray-200 text-charcoal';
      default:
        return 'bg-gray-50 border-gray-200 text-charcoal';
    }
  };

  const formatErrorType = (type: string) => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
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

  if (!customer) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Error Details" size="xl">
      <div className="space-y-6">
        {/* Customer Header */}
        <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
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

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading error details...</span>
          </div>
        ) : errors.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>No errors found for this customer</p>
            <p className="text-sm">This customer has no recent error events</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Error List */}
            <div className="lg:col-span-1">
              <h4 className="text-sm font-medium text-gray-900 mb-3">Recent Errors</h4>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {errors.map(error => (
                  <button
                    key={error.id}
                    onClick={() => setSelectedError(error)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedError?.id === error.id
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2 mb-2">
                      {getErrorIcon(error.type)}
                      <div className="flex items-center space-x-1">
                        {error.channel === 'EMAIL' ? (
                          <Mail className="w-3 h-3 text-gray-500" />
                        ) : (
                          <MessageSquare className="w-3 h-3 text-gray-500" />
                        )}
                        <span className="text-xs text-gray-500">{error.channel}</span>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-gray-900 mb-1">
                      {formatErrorType(error.type)}
                    </p>
                    <p className="text-xs text-gray-500 mb-1 line-clamp-2">{error.message}</p>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{formatDate(error.timestamp)}</span>
                      {error.retryCount > 0 && <span>Retry #{error.retryCount}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Error Details */}
            <div className="lg:col-span-2">
              {selectedError ? (
                <div className="space-y-4">
                  {/* Error Header */}
                  <div
                    className={`p-4 rounded-lg border ${getErrorColorClasses(selectedError.type)}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        {getErrorIcon(selectedError.type)}
                        <h4 className="font-medium">{formatErrorType(selectedError.type)}</h4>
                      </div>
                      <div className="flex items-center space-x-2">
                        {selectedError.channel === 'EMAIL' ? (
                          <Mail className="w-4 h-4" />
                        ) : (
                          <MessageSquare className="w-4 h-4" />
                        )}
                        <span className="text-sm font-medium">{selectedError.channel}</span>
                      </div>
                    </div>
                    <p className="text-sm">{selectedError.message}</p>
                  </div>

                  {/* Technical Details */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-sm font-medium text-gray-900">Technical Details</h5>
                      <button
                        onClick={() => copyToClipboard(selectedError.technicalDetails)}
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center space-x-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </button>
                    </div>
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-white p-3 rounded border max-h-32 overflow-y-auto">
                      {selectedError.technicalDetails}
                    </pre>
                  </div>

                  {/* Metadata */}
                  {selectedError.metadata && (
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <h5 className="text-sm font-medium text-gray-900 mb-3">
                        Additional Information
                      </h5>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {selectedError.metadata.httpStatusCode && (
                          <div>
                            <span className="text-gray-600">HTTP Status:</span>
                            <span className="ml-2 font-medium">
                              {selectedError.metadata.httpStatusCode}
                            </span>
                          </div>
                        )}
                        {selectedError.metadata.twilioErrorCode && (
                          <div>
                            <span className="text-gray-600">Twilio Code:</span>
                            <span className="ml-2 font-medium">
                              {selectedError.metadata.twilioErrorCode}
                            </span>
                          </div>
                        )}
                        {selectedError.metadata.sendgridErrorCode && (
                          <div>
                            <span className="text-gray-600">SendGrid Code:</span>
                            <span className="ml-2 font-medium">
                              {selectedError.metadata.sendgridErrorCode}
                            </span>
                          </div>
                        )}
                        {selectedError.metadata.bounceType && (
                          <div>
                            <span className="text-gray-600">Bounce Type:</span>
                            <span className="ml-2 font-medium">
                              {selectedError.metadata.bounceType}
                            </span>
                          </div>
                        )}
                        {selectedError.metadata.spamScore && (
                          <div>
                            <span className="text-gray-600">Spam Score:</span>
                            <span className="ml-2 font-medium">
                              {selectedError.metadata.spamScore}
                            </span>
                          </div>
                        )}
                        {selectedError.errorCode && (
                          <div>
                            <span className="text-gray-600">Error Code:</span>
                            <span className="ml-2 font-medium">{selectedError.errorCode}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-600">Request ID:</span>
                          <span className="ml-2 font-mono text-xs">{selectedError.requestId}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Retry Count:</span>
                          <span className="ml-2 font-medium">{selectedError.retryCount}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Resolution */}
                  {selectedError.resolution && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h5 className="text-sm font-medium text-green-900 mb-2">Resolution</h5>
                      <p className="text-sm text-green-800">{selectedError.resolution}</p>
                    </div>
                  )}

                  {/* Actions */}
                  {selectedError.canRetry && (
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleRetryRequest(selectedError.id)}
                        disabled={retrying === selectedError.id}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                      >
                        <RefreshCw
                          className={`w-4 h-4 ${retrying === selectedError.id ? 'animate-spin' : ''}`}
                        />
                        <span>
                          {retrying === selectedError.id ? 'Retrying...' : 'Retry Request'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p>Select an error to view details</p>
                </div>
              )}
            </div>
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
