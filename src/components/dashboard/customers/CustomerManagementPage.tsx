'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { CustomerTable } from './CustomerTable';
import type { Customer } from './types';
import { useCustomers } from './hooks/useCustomers';
import { CustomerEditModal } from './components/CustomerEditModal';
import { CreateReviewRequestModal } from './components/CreateReviewRequestModal';
import { CustomerCreationConfirmationModal } from './components/CustomerCreationConfirmationModal';
import { type ReviewRequestCreationResult } from './services/reviewRequestService';
import { MESSAGE_TEMPLATES } from './data/messageTemplates';

// Customer management with live database integration

export function CustomerManagementPage(): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('');
  const { customers, loading, searching, error, refetch, createCustomer, updateCustomer } =
    useCustomers({
      search: searchQuery,
      page: 1,
      limit: 20,
    });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [showReviewRequestModal, setShowReviewRequestModal] = useState(false);
  const [selectedCustomerForReview, setSelectedCustomerForReview] = useState<Customer | null>(null);
  const [createdCustomer, setCreatedCustomer] = useState<Customer | null>(null);
  const [selectedCustomersForBulk, setSelectedCustomersForBulk] = useState<Set<string>>(new Set());

  const handleCustomerSelect = useCallback((customer: Customer) => {
    console.log('Customer selected:', customer);
    // TODO: Handle customer selection (could be used for bulk selection, details view, etc.)
  }, []);

  const handleOpenCreateModal = useCallback(() => {
    setShowCreateModal(true);
  }, []);

  const handleCloseCreateModal = useCallback(() => {
    setShowCreateModal(false);
  }, []);

  const handleCustomerCreated = useCallback(
    async (customerData: Partial<Customer>): Promise<Customer | null> => {
      try {
        const newCustomer = await createCustomer(customerData);
        if (newCustomer) {
          setCreatedCustomer(newCustomer);
          setShowCreateModal(false);
          setShowConfirmationModal(true);
          return newCustomer;
        }
        return null;
      } catch (error) {
        console.error('Error creating customer:', error);
        return null;
      }
    },
    [createCustomer]
  );

  const handleCloseConfirmationModal = useCallback(() => {
    setShowConfirmationModal(false);
    setCreatedCustomer(null);
  }, []);

  const handleOpenReviewRequestModal = useCallback((customer: Customer) => {
    setSelectedCustomerForReview(customer);
    setShowReviewRequestModal(true);
  }, []);

  const handleCloseReviewRequestModal = useCallback(() => {
    setShowReviewRequestModal(false);
    setSelectedCustomerForReview(null);
  }, []);

  const handleSendReviewRequest = useCallback((templateId: string, customer: Customer) => {
    console.log('Sending review request:', { templateId, customerId: customer.id });
    // This is now handled by the modal internally
    setShowReviewRequestModal(false);
    setSelectedCustomerForReview(null);
  }, []);

  const handleReviewRequestsCreated = useCallback(
    (result: ReviewRequestCreationResult) => {
      console.log('Review requests created:', result);

      // Show success notification
      if (result.successfulRequests > 0) {
        // In a real app, you'd use a toast notification system
        console.log(`Success: ${result.successfulRequests} review requests created`);

        // Refresh customer data to show updated request status
        refetch();
      }

      if (result.errors.length > 0) {
        console.error('Review request creation errors:', result.errors);
      }
    },
    [refetch]
  );

  const handleBulkReviewRequest = useCallback(() => {
    if (selectedCustomersForBulk.size > 0) {
      setShowReviewRequestModal(true);
    }
  }, [selectedCustomersForBulk]);

  const handleCustomerSelectionChange = useCallback((selectedIds: Set<string>) => {
    setSelectedCustomersForBulk(selectedIds);
  }, []);

  const handleSendReviewNow = useCallback(async (customer: Customer) => {
    // Close confirmation modal and open review request modal with immediate send
    setShowConfirmationModal(false);
    setSelectedCustomerForReview(customer);
    setShowReviewRequestModal(true);
  }, []);

  const handleScheduleReview = useCallback(async (customer: Customer) => {
    // Close confirmation modal and open review request modal with scheduling options
    setShowConfirmationModal(false);
    setSelectedCustomerForReview(customer);
    setShowReviewRequestModal(true);
  }, []);

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="grid-container py-6">
        <div className="col-span-full">
          <div className="mb-6">
            {(() => {
              const currentHour = new Date().getHours();
              let greeting = 'Good morning';
              if (currentHour >= 12 && currentHour < 18) {
                greeting = 'Afternoon';
              } else if (currentHour >= 18) {
                greeting = 'Evening';
              }
              return (
                <>
                  <h1 className="text-3xl font-bold text-slate-900 mb-2">{greeting}, Matt</h1>
                  <p className="text-slate-600">
                    Manage your customer database, send review requests, and track engagement.
                  </p>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Quick Stats Cards */}
      <div className="grid-container py-6">
        <div className="col-span-full">
          <div className="flex flex-wrap gap-6 mb-6">
            <button
              onClick={handleOpenCreateModal}
              className="bg-white p-10 rounded-2xl border border-gray-200 flex-1 min-w-[250px] hover:border-forgedorange-300 hover:bg-forgedorange-50 transition-colors group text-left"
            >
              <div className="flex items-center justify-start space-x-5 min-h-[40px]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-8 h-8 text-forgedorange-500 group-hover:text-forgedorange-600"
                  viewBox="0 -960 960 960"
                  fill="currentColor"
                >
                  <path d="M143.85-189.23v-583.08l531.61 225h-7.38q-26.54.77-51.2 6.66-24.65 5.88-45.96 16.04L203.85-680v147.69L420.77-480l-216.92 52.31V-280l228.69-97.39q-6.46 17.24-10.08 35.31-3.61 18.08-4 34.77v1.23L143.85-189.23Zm532.3 81.54q-74.92 0-127.46-52.54-52.53-52.54-52.53-127.46 0-74.93 52.53-127.46 52.54-52.54 127.46-52.54 74.93 0 127.46 52.54 52.54 52.53 52.54 127.46 0 74.92-52.54 127.46-52.53 52.54-127.46 52.54Zm66-89.08 24.93-24.92-73.23-73.23v-110.47h-35.39v124.93l83.69 83.69Zm-538.3-180.62V-680v400-97.39Z" />
                </svg>
                <h3 className="text-lg font-semibold flex-1 leading-[120%] group-hover:text-forgedorange-700">
                  Add new customer
                </h3>
              </div>
            </button>
            <div className="bg-white p-10 rounded-2xl border border-gray-200 flex-1 min-w-[250px]">
              <div className="flex items-center justify-start space-x-5 min-h-[40px]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-8 h-8 text-forgedorange-500"
                  viewBox="0 -960 960 960"
                  fill="currentColor"
                >
                  <path d="m424-296 282-282-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z" />
                </svg>
                <h3 className="text-lg font-semibold flex-1 leading-[120%]">
                  Send bulk review requests
                </h3>
              </div>
            </div>
            <Link
              href="/dashboard/scheduled-emails"
              className="bg-white p-10 rounded-2xl border border-gray-200 flex-1 min-w-[250px] hover:border-forgedorange-300 hover:bg-forgedorange-50 transition-colors group text-left block"
            >
              <div className="flex items-center justify-start space-x-5 min-h-[40px]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-8 h-8 text-forgedorange-500 group-hover:text-forgedorange-600"
                  viewBox="0 -960 960 960"
                  fill="currentColor"
                >
                  <path d="m612-292 56-56-148-148v-184h-80v216l172 172ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z" />
                </svg>
                <h3 className="text-lg font-semibold flex-1 leading-[120%] group-hover:text-forgedorange-700">
                  Manage scheduled emails
                </h3>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Customer Table */}
      <div className="grid-container pb-8">
        {/* Customer Table - Full width on all breakpoints */}
        <div className="col-span-full">
          {loading ? (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-forgedorange-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading customers...</p>
            </div>
          ) : error ? (
            <div className="bg-white border border-red-200 rounded-lg p-8 text-center">
              <p className="text-red-600 mb-4">Error loading customers: {error}</p>
              <button
                onClick={refetch}
                className="px-4 py-2 bg-forgedorange-600 text-white rounded-md hover:bg-forgedorange-700"
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              <CustomerTable
                customers={customers}
                onCustomerSelect={handleCustomerSelect}
                onSelectionChange={handleCustomerSelectionChange}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onCreateCustomer={createCustomer}
                onUpdateCustomer={updateCustomer}
                onOpenCreateModal={handleOpenCreateModal}
                onSendReviewRequest={handleOpenReviewRequestModal}
                searching={searching}
              />

              {/* Bulk Action Bar */}
              {selectedCustomersForBulk.size > 0 && (
                <div className="mt-4 bg-charcoal border border-charcoal rounded-full p-4 px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="text-sm text-white font-medium">
                        {selectedCustomersForBulk.size} customer
                        {selectedCustomersForBulk.size !== 1 ? 's' : ''} selected
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => setSelectedCustomersForBulk(new Set())}
                        className="text-sm text-white/70 hover:text-white transition-colors"
                      >
                        Clear Selection
                      </button>
                      <button
                        onClick={handleBulkReviewRequest}
                        className="px-5 py-2 bg-white text-charcoal text-sm font-medium rounded-full hover:bg-white/90 transition-colors"
                      >
                        Send Bulk Review Request
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create Customer Modal */}
      <CustomerEditModal
        isOpen={showCreateModal}
        onClose={handleCloseCreateModal}
        customer={null}
        mode="create"
        onSave={() => {}} // Not used for create mode
        onCreate={handleCustomerCreated}
      />

      {/* Customer Creation Confirmation Modal */}
      {createdCustomer && (
        <CustomerCreationConfirmationModal
          isOpen={showConfirmationModal}
          onClose={handleCloseConfirmationModal}
          customer={createdCustomer}
          onSendReviewNow={handleSendReviewNow}
          onScheduleReview={handleScheduleReview}
        />
      )}

      {/* Create Review Request Modal */}
      <CreateReviewRequestModal
        isOpen={showReviewRequestModal}
        onClose={handleCloseReviewRequestModal}
        customer={selectedCustomerForReview}
        customers={customers}
        selectedCustomerIds={selectedCustomersForBulk}
        templates={MESSAGE_TEMPLATES}
        onSend={handleSendReviewRequest}
        onReviewRequestsCreated={handleReviewRequestsCreated}
      />
    </div>
  );
}
