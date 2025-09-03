'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Mail,
  Calendar,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Edit,
  Trash2,
} from '@/components/ui/icons';

// Date utility functions to replace date-fns
const formatDate = (date: Date, formatStr: string): string => {
  if (formatStr === 'PPpp') {
    return date.toLocaleString('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }
  if (formatStr === 'MMM d, yyyy') {
    return date.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
  if (formatStr === 'h:mm a') {
    return date.toLocaleTimeString('en-GB', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  if (formatStr === "yyyy-MM-dd'T'HH:mm") {
    return date.toISOString().slice(0, 16);
  }
  return date.toLocaleDateString('en-GB');
};

const formatDistanceToNow = (date: Date): string => {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 60) {
    return `${Math.abs(diffMinutes)} minute${Math.abs(diffMinutes) !== 1 ? 's' : ''}`;
  } else if (diffHours < 24) {
    return `${Math.abs(diffHours)} hour${Math.abs(diffHours) !== 1 ? 's' : ''}`;
  } else {
    return `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''}`;
  }
};

const isPast = (date: Date): boolean => {
  return date.getTime() < new Date().getTime();
};

const isFuture = (date: Date): boolean => {
  return date.getTime() > new Date().getTime();
};

interface ScheduledEmail {
  id: string;
  channel: 'SMS' | 'EMAIL';
  status: string;
  subject?: string;
  reviewUrl: string;
  trackingUuid: string;
  scheduledFor?: string;
  createdAt: string;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
}

interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface ScheduledEmailsResponse {
  requests: ScheduledEmail[];
  pagination: PaginationInfo;
}

interface RescheduleModalProps {
  email: ScheduledEmail;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newDateTime: Date) => void;
}

function RescheduleModal({ email, isOpen, onClose, onConfirm }: RescheduleModalProps) {
  const [newDateTime, setNewDateTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && email.scheduledFor) {
      // Pre-fill with current scheduled time
      const currentScheduled = new Date(email.scheduledFor);
      const localDateTime = formatDate(currentScheduled, "yyyy-MM-dd'T'HH:mm");
      setNewDateTime(localDateTime);
    }
  }, [isOpen, email.scheduledFor]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDateTime) return;

    setIsSubmitting(true);
    try {
      const selectedDate = new Date(newDateTime);
      await onConfirm(selectedDate);
      onClose();
    } catch (error) {
      console.error('Failed to reschedule:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const minDateTime = formatDate(new Date(), "yyyy-MM-dd'T'HH:mm");
  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + 6);
  const maxDateTime = formatDate(maxDate, "yyyy-MM-dd'T'HH:mm");

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Reschedule Email</h3>

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">
            Customer: {email.customer.firstName} {email.customer.lastName}
          </p>
          <p className="text-sm text-gray-600 mb-4">
            Current time:{' '}
            {email.scheduledFor ? formatDate(new Date(email.scheduledFor), 'PPpp') : 'Not set'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="newDateTime" className="block text-sm font-medium text-gray-700 mb-2">
              New scheduled time
            </label>
            <input
              type="datetime-local"
              id="newDateTime"
              value={newDateTime}
              onChange={e => setNewDateTime(e.target.value)}
              min={minDateTime}
              max={maxDateTime}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !newDateTime}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Rescheduling...' : 'Reschedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ScheduledEmailsTable() {
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    totalCount: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<'all' | 'SMS' | 'EMAIL'>('all');
  const [rescheduleModal, setRescheduleModal] = useState<{
    email: ScheduledEmail | null;
    isOpen: boolean;
  }>({ email: null, isOpen: false });

  const fetchScheduledEmails = useCallback(
    async (page = 1) => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          page: page.toString(),
          limit: pagination.limit.toString(),
        });

        if (selectedChannel !== 'all') {
          params.set('channel', selectedChannel);
        }

        const response = await fetch(`/api/review-requests/scheduled?${params}`);
        const data: { success: boolean; data: ScheduledEmailsResponse; error?: any } =
          await response.json();

        if (!data.success) {
          throw new Error(data.error?.message || 'Failed to fetch scheduled emails');
        }

        setScheduledEmails(data.data.requests);
        setPagination(data.data.pagination);
      } catch (err) {
        console.error('Error fetching scheduled emails:', err);
        setError(err instanceof Error ? err.message : 'Failed to load scheduled emails');
        setScheduledEmails([]);
      } finally {
        setLoading(false);
      }
    },
    [pagination.limit, selectedChannel]
  );

  useEffect(() => {
    fetchScheduledEmails();
  }, [fetchScheduledEmails]);

  const handleCancelEmail = async (emailId: string) => {
    if (!confirm('Are you sure you want to cancel this scheduled email?')) {
      return;
    }

    try {
      const response = await fetch(`/api/review-requests/scheduled/${emailId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'cancel',
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to cancel email');
      }

      // Refresh the list
      await fetchScheduledEmails(pagination.page);
    } catch (err) {
      console.error('Error cancelling email:', err);
      alert(err instanceof Error ? err.message : 'Failed to cancel email');
    }
  };

  const handleRescheduleEmail = async (emailId: string, newDateTime: Date) => {
    try {
      const response = await fetch(`/api/review-requests/scheduled/${emailId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'reschedule',
          scheduledFor: newDateTime.toISOString(),
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to reschedule email');
      }

      // Refresh the list
      await fetchScheduledEmails(pagination.page);
    } catch (err) {
      console.error('Error rescheduling email:', err);
      alert(err instanceof Error ? err.message : 'Failed to reschedule email');
      throw err;
    }
  };

  const getStatusIcon = (scheduledFor?: string) => {
    if (!scheduledFor) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;

    const scheduledDate = new Date(scheduledFor);
    const now = new Date();
    const timeDiff = scheduledDate.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);

    if (isPast(scheduledDate)) {
      return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    } else if (hoursDiff <= 24) {
      return <Clock className="h-4 w-4 text-blue-500" />;
    } else {
      return <Calendar className="h-4 w-4 text-green-500" />;
    }
  };

  const getStatusText = (scheduledFor?: string) => {
    if (!scheduledFor) return 'Not scheduled';

    const scheduledDate = new Date(scheduledFor);
    const now = new Date();

    if (isPast(scheduledDate)) {
      return 'Overdue';
    } else {
      return `In ${formatDistanceToNow(scheduledDate)}`;
    }
  };

  const openRescheduleModal = (email: ScheduledEmail) => {
    setRescheduleModal({ email, isOpen: true });
  };

  const closeRescheduleModal = () => {
    setRescheduleModal({ email: null, isOpen: false });
  };

  if (loading && scheduledEmails.length === 0) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading scheduled emails...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Scheduled Emails</h2>
          <p className="text-gray-600">Manage your upcoming email campaigns</p>
        </div>

        {/* Channel Filter */}
        <div className="flex space-x-2">
          <select
            value={selectedChannel}
            onChange={e => setSelectedChannel(e.target.value as 'all' | 'SMS' | 'EMAIL')}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Channels</option>
            <option value="EMAIL">Email Only</option>
            <option value="SMS">SMS Only</option>
          </select>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <XCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
              <button
                onClick={() => fetchScheduledEmails()}
                className="mt-2 text-sm text-red-800 hover:text-red-900 underline"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {!error && scheduledEmails.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <div className="flex items-center">
            <Calendar className="h-5 w-5 text-blue-600" />
            <div className="ml-3">
              <p className="text-sm text-blue-800">
                <span className="font-medium">{pagination.totalCount}</span> emails scheduled
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {scheduledEmails.length === 0 && !loading ? (
        <div className="text-center py-12">
          <Mail className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No scheduled emails</h3>
          <p className="mt-1 text-sm text-gray-500">
            {selectedChannel === 'all'
              ? "You don't have any emails scheduled yet."
              : `No scheduled ${selectedChannel.toLowerCase()} campaigns found.`}
          </p>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {scheduledEmails.map(email => (
              <li key={email.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">{getStatusIcon(email.scheduledFor)}</div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {email.customer.firstName} {email.customer.lastName}
                        </p>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {email.channel}
                        </span>
                      </div>

                      <p className="text-sm text-gray-500 truncate">{email.customer.email}</p>

                      {email.subject && (
                        <p className="text-sm text-gray-600 truncate mt-1">
                          Subject: {email.subject}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-900">
                        {email.scheduledFor
                          ? formatDate(new Date(email.scheduledFor), 'MMM d, yyyy')
                          : 'Not scheduled'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {email.scheduledFor
                          ? formatDate(new Date(email.scheduledFor), 'h:mm a')
                          : ''}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {getStatusText(email.scheduledFor)}
                      </p>
                    </div>

                    <div className="flex space-x-2">
                      <button
                        onClick={() => openRescheduleModal(email)}
                        className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                        title="Reschedule"
                      >
                        <Edit className="h-4 w-4" />
                      </button>

                      <button
                        onClick={() => handleCancelEmail(email.id)}
                        className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                        title="Cancel"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex justify-between items-center w-full">
            <p className="text-sm text-gray-700">
              Showing page <span className="font-medium">{pagination.page}</span> of{' '}
              <span className="font-medium">{pagination.totalPages}</span>
            </p>

            <div className="flex space-x-2">
              <button
                onClick={() => fetchScheduledEmails(pagination.page - 1)}
                disabled={!pagination.hasPrevPage || loading}
                className="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>

              <button
                onClick={() => fetchScheduledEmails(pagination.page + 1)}
                disabled={!pagination.hasNextPage || loading}
                className="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleModal.email && (
        <RescheduleModal
          email={rescheduleModal.email}
          isOpen={rescheduleModal.isOpen}
          onClose={closeRescheduleModal}
          onConfirm={newDateTime => handleRescheduleEmail(rescheduleModal.email!.id, newDateTime)}
        />
      )}
    </div>
  );
}
