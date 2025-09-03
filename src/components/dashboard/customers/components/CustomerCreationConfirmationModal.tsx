'use client';

import React, { useState } from 'react';
import { type Customer } from '../types';
import { Modal } from './Modal';
import { formatName } from '../utils';

interface CustomerCreationConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer;
  onSendReviewNow: (customer: Customer) => Promise<void>;
  onScheduleReview: (customer: Customer) => Promise<void>;
}

export function CustomerCreationConfirmationModal({
  isOpen,
  onClose,
  customer,
  onSendReviewNow,
  onScheduleReview,
}: CustomerCreationConfirmationModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingAction, setProcessingAction] = useState<'send' | 'schedule' | null>(null);

  const handleSendReviewNow = async () => {
    setIsProcessing(true);
    setProcessingAction('send');
    try {
      await onSendReviewNow(customer);
      onClose();
    } catch (error) {
      console.error('Error sending review now:', error);
      // Error handling could be added here
    } finally {
      setIsProcessing(false);
      setProcessingAction(null);
    }
  };

  const handleScheduleReview = async () => {
    setIsProcessing(true);
    setProcessingAction('schedule');
    try {
      await onScheduleReview(customer);
      onClose();
    } catch (error) {
      console.error('Error scheduling review:', error);
      // Error handling could be added here
    } finally {
      setIsProcessing(false);
      setProcessingAction(null);
    }
  };

  const getPreferredChannel = () => {
    if (customer.email && customer.phone) {
      return 'email'; // Default to email if both available
    } else if (customer.email) {
      return 'email';
    } else if (customer.phone) {
      return 'SMS';
    }
    return 'email';
  };

  const getContactDisplay = () => {
    const channel = getPreferredChannel();
    if (channel === 'email') {
      return customer.email;
    }
    return customer.phone;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Customer Created Successfully!" size="md">
      <div className="space-y-6">
        {/* Success Header */}
        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-green-800">
                {formatName(customer.firstName)} {formatName(customer.lastName)} added!
              </h3>
              <p className="text-sm text-green-600">
                Customer has been successfully created and is ready for review requests.
              </p>
            </div>
          </div>
        </div>

        {/* Customer Summary */}
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h4 className="font-medium text-charcoal mb-3">Customer Details</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Name:</span>
              <span className="font-medium text-charcoal">
                {formatName(customer.firstName)} {formatName(customer.lastName)}
              </span>
            </div>
            {customer.email && (
              <div className="flex justify-between">
                <span className="text-gray-600">Email:</span>
                <span className="font-medium text-charcoal">{customer.email}</span>
              </div>
            )}
            {customer.phone && (
              <div className="flex justify-between">
                <span className="text-gray-600">Phone:</span>
                <span className="font-medium text-charcoal">{customer.phone}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600">Preferred Channel:</span>
              <span className="font-medium text-charcoal capitalize">
                {getPreferredChannel()} ({getContactDisplay()})
              </span>
            </div>
          </div>
        </div>

        {/* Action Prompt */}
        <div className="text-center space-y-2">
          <h4 className="font-medium text-charcoal">What would you like to do next?</h4>
          <p className="text-sm text-gray-600">
            You can send a review request immediately or schedule it for later.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleSendReviewNow}
            disabled={isProcessing}
            className="flex-1 flex items-center justify-center px-4 py-3 bg-forgedorange-600 text-white rounded-lg hover:bg-forgedorange-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing && processingAction === 'send' ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
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
                Sending...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
                Send Review Now
              </>
            )}
          </button>

          <button
            onClick={handleScheduleReview}
            disabled={isProcessing}
            className="flex-1 flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing && processingAction === 'schedule' ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
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
                Scheduling...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Schedule Review
              </>
            )}
          </button>
        </div>

        {/* Skip Option */}
        <div className="text-center pt-2 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors font-medium"
          >
            Skip for now
          </button>
        </div>
      </div>
    </Modal>
  );
}
