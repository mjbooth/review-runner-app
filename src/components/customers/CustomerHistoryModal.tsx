'use client';

import React from 'react';
import { Modal } from '@/components/dashboard/customers/components/Modal';
import {
  Clock,
  User,
  Mail,
  MessageSquare,
  CalendarDays,
  Send,
  CheckCircle,
  XCircle,
  AlertCircle,
  History,
} from '@/components/ui/icons';
import { format } from 'date-fns';
import useSWR from 'swr';
import { addAuthHeaders } from '@/lib/auth-headers';
import type { Customer } from '@prisma/client';

interface CustomerHistoryModalProps {
  customer: Customer | null;
  isOpen: boolean;
  onClose: () => void;
}

interface HistoryEvent {
  id: string;
  type:
    | 'created'
    | 'updated'
    | 'request_sent'
    | 'request_scheduled'
    | 'request_delivered'
    | 'request_clicked'
    | 'request_failed'
    | 'opted_out';
  timestamp: string;
  description: string;
  metadata?: {
    channel?: 'sms' | 'email';
    status?: string;
    updatedBy?: string;
    requestId?: string;
    templateName?: string;
    error?: string;
  };
  icon?: React.ElementType;
  iconColor?: string;
}

const fetcher = async (url: string) => {
  console.log('=== FETCHER DEBUG ===');
  console.log('Requested URL:', url);
  console.log('Window location:', window.location.href);
  console.log('Window origin:', window.location.origin);
  console.log('Auth headers:', addAuthHeaders());

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...addAuthHeaders(),
    },
    credentials: 'include',
  });

  console.log('Response status:', response.status);
  console.log('Response URL:', response.url);
  console.log('Response headers:', Object.fromEntries(response.headers.entries()));

  if (!response.ok) {
    console.log('=== REQUEST FAILED ===');
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  console.log('Response data:', data);
  console.log('=== END FETCHER DEBUG ===');
  return data;
};

function getEventIcon(type: HistoryEvent['type']): { icon: React.ElementType; color: string } {
  switch (type) {
    case 'created':
      return { icon: User, color: 'text-green-600' };
    case 'updated':
      return { icon: History, color: 'text-blue-600' };
    case 'request_sent':
      return { icon: Send, color: 'text-purple-600' };
    case 'request_scheduled':
      return { icon: CalendarDays, color: 'text-orange-600' };
    case 'request_delivered':
      return { icon: CheckCircle, color: 'text-green-600' };
    case 'request_clicked':
      return { icon: CheckCircle, color: 'text-emerald-600' };
    case 'request_failed':
      return { icon: XCircle, color: 'text-red-600' };
    case 'opted_out':
      return { icon: AlertCircle, color: 'text-yellow-600' };
    default:
      return { icon: Clock, color: 'text-gray-600' };
  }
}

function getChannelIcon(channel?: string) {
  if (channel === 'sms') return <MessageSquare className="h-3 w-3" />;
  if (channel === 'email') return <Mail className="h-3 w-3" />;
  return null;
}

function Badge({
  children,
  variant = 'default',
  className = '',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'secondary' | 'outline';
  className?: string;
}) {
  const variants = {
    default: 'bg-green-600 text-white',
    secondary: 'bg-gray-100 text-gray-900',
    outline: 'border border-gray-300 bg-white text-gray-700',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function CustomerHistoryModal({ customer, isOpen, onClose }: CustomerHistoryModalProps) {
  const { data, error, isLoading } = useSWR(
    customer?.id ? `/api/customers/${customer.id}/history` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      onSuccess: data => {
        console.log('History data received:', data);
      },
      onError: err => {
        console.error('History fetch error:', err);
      },
    }
  );

  if (!customer) return null;

  const events: HistoryEvent[] = data?.events || [];

  // Debug logging
  if (data) {
    console.log('Customer History Modal - Data:', {
      eventsCount: events.length,
      events: events,
      rawData: data,
    });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Customer History" size="lg">
      <div className="space-y-4">
        {/* Customer Overview */}
        <div className="rounded-lg border p-4 space-y-2">
          <h3 className="font-semibold text-lg">
            {customer.firstName} {customer.lastName}
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Mail className="h-4 w-4" />
              {customer.email || 'No email'}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <MessageSquare className="h-4 w-4" />
              {customer.phone || 'No phone'}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <CalendarDays className="h-4 w-4" />
              Created: {format(new Date(customer.createdAt), 'MMM d, yyyy')}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="h-4 w-4" />
              Updated: {format(new Date(customer.updatedAt), 'MMM d, yyyy')}
            </div>
          </div>
          {customer.isActive ? (
            <Badge variant="default">Active</Badge>
          ) : (
            <Badge variant="secondary">Inactive</Badge>
          )}
        </div>

        <div className="border-t pt-4" />

        {/* Activity Timeline */}
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Activity Timeline
          </h3>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-gray-600">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-500" />
              <p>Failed to load history</p>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              <History className="h-8 w-8 mx-auto mb-2" />
              <p>No activity history available</p>
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto pr-4">
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />

                {/* Events */}
                <div className="space-y-4">
                  {events.map(event => {
                    const { icon: Icon, color } = getEventIcon(event.type);
                    return (
                      <div key={event.id} className="relative flex gap-4">
                        {/* Icon */}
                        <div
                          className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white border-2 ${color} border-current`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 pb-4">
                          <div className="rounded-lg border p-3 space-y-2">
                            <div className="flex items-start justify-between">
                              <div className="space-y-1">
                                <p className="font-medium">{event.description}</p>
                                <div className="flex items-center gap-2">
                                  <p className="text-xs text-gray-600">
                                    {format(new Date(event.timestamp), 'MMM d, yyyy h:mm a')}
                                  </p>
                                  {event.metadata?.channel && (
                                    <Badge variant="outline" className="text-xs gap-1">
                                      {getChannelIcon(event.metadata.channel)}
                                      {event.metadata.channel.toUpperCase()}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              {event.metadata?.status && (
                                <Badge variant="secondary" className="text-xs">
                                  {event.metadata.status}
                                </Badge>
                              )}
                            </div>

                            {/* Additional metadata */}
                            {event.metadata?.templateName && (
                              <p className="text-xs text-gray-600">
                                Template: {event.metadata.templateName}
                              </p>
                            )}
                            {event.metadata?.updatedBy && (
                              <p className="text-xs text-gray-600">
                                By: {event.metadata.updatedBy}
                              </p>
                            )}
                            {event.metadata?.error && (
                              <p className="text-xs text-red-600">Error: {event.metadata.error}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
