'use client';

import React from 'react';
import { type Customer } from '../types';
import { Modal } from './Modal';
import { formatPhoneNumber, formatDate, formatName } from '../utils';

interface CustomerDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
}

interface DetailFieldProps {
  label: string;
  value: string | null;
  className?: string;
}

function DetailField({ label, value, className = '' }: DetailFieldProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-charcoal">{value || '—'}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusColors: Record<string, string> = {
    Pending: 'bg-amber-50 text-amber-700 border-amber-200',
    Sent: 'bg-blue-50 text-blue-700 border-blue-200',
    Delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Clicked: 'bg-green-50 text-green-700 border-green-200',
    Completed: 'bg-green-50 text-green-700 border-green-200',
    Failed: 'bg-red-50 text-red-700 border-red-200',
    Bounced: 'bg-red-50 text-red-700 border-red-200',
    'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
    'Opted Out': 'bg-gray-50 text-gray-700 border-gray-200',
    Suppressed: 'bg-gray-50 text-gray-700 border-gray-200',
  };

  const colorClass = statusColors[status] || 'bg-slate-50 text-slate-700 border-slate-200';

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}
    >
      {status}
    </span>
  );
}

function SuppressionBadge({ suppressed }: { suppressed: 'active' | 'suppressed' }) {
  if (suppressed === 'active') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        <svg
          className="w-3 h-3 mr-1"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="16,12 12,8 8,12" />
        </svg>
        Active
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
      <svg
        className="w-3 h-3 mr-1"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="m4.9 4.9 14.2 14.2" />
      </svg>
      Suppressed
    </span>
  );
}

export function CustomerDetailsModal({ isOpen, onClose, customer }: CustomerDetailsModalProps) {
  if (!customer) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Customer Details" size="lg">
      <div className="space-y-6">
        {/* Customer Header */}
        <div className="bg-basewarm-50 rounded-lg p-4 border border-basewarm-200">
          <div className="flex items-center space-x-4">
            {/* Avatar/Initials */}
            <div className="w-12 h-12 bg-forgedorange-500 rounded-full flex items-center justify-center">
              <span className="text-white font-semibold text-lg">
                {formatName(customer.firstName).charAt(0)}
                {formatName(customer.lastName).charAt(0)}
              </span>
            </div>

            {/* Name and Status */}
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-charcoal">
                {formatName(customer.firstName)} {formatName(customer.lastName)}
              </h3>
              <div className="flex items-center space-x-3 mt-1">
                <StatusBadge status={customer.status} />
                <SuppressionBadge suppressed={customer.suppressed} />
              </div>
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column - Contact Information */}
          <div className="space-y-4">
            <h4 className="text-base font-semibold text-charcoal border-b border-gray-200 pb-2">
              Contact Information
            </h4>

            <dl className="space-y-4">
              <DetailField label="Email Address" value={customer.email} />

              <DetailField label="Phone Number" value={formatPhoneNumber(customer.phone)} />

              <DetailField
                label="Preferred Channel"
                value={customer.channel ? customer.channel.toUpperCase() : null}
              />
            </dl>
          </div>

          {/* Right Column - Account Information */}
          <div className="space-y-4">
            <h4 className="text-base font-semibold text-charcoal border-b border-gray-200 pb-2">
              Account Information
            </h4>

            <dl className="space-y-4">
              <DetailField label="Date Added" value={formatDate(customer.dateAdded)} />

              <DetailField
                label="Last Request"
                value={customer.lastRequest ? formatDate(customer.lastRequest) : null}
              />

              <DetailField label="Customer ID" value={customer.id} className="font-mono text-xs" />

              <DetailField
                label="Business ID"
                value={customer.businessId}
                className="font-mono text-xs"
              />
            </dl>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-200">
          <div className="flex space-x-3">
            <button className="px-4 py-2 bg-forgedorange-600 text-white rounded-lg hover:bg-forgedorange-700 transition-colors text-sm font-medium">
              Send Review Request
            </button>
            <button className="px-4 py-2 bg-white border border-gray-300 text-charcoal rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium">
              Edit Customer
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-500 hover:text-gray-700 transition-colors text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
