import { useState, useCallback } from 'react';
import { type Customer } from '../types';

interface UseCustomerModalsProps {
  updateCustomer?: (
    customerId: string,
    customerData: Partial<Customer>
  ) => Promise<Customer | null>;
}

export function useCustomerModals({ updateCustomer }: UseCustomerModalsProps = {}) {
  const [detailsModal, setDetailsModal] = useState<{
    isOpen: boolean;
    customer: Customer | null;
  }>({
    isOpen: false,
    customer: null,
  });

  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    customer: Customer | null;
    mode: 'create' | 'edit';
  }>({
    isOpen: false,
    customer: null,
    mode: 'edit',
  });

  const [notesModal, setNotesModal] = useState<{
    isOpen: boolean;
    customer: Customer | null;
  }>({
    isOpen: false,
    customer: null,
  });

  const [analyticsModal, setAnalyticsModal] = useState<{
    isOpen: boolean;
    customer: Customer | null;
  }>({
    isOpen: false,
    customer: null,
  });

  const [historyModal, setHistoryModal] = useState<{
    isOpen: boolean;
    customer: Customer | null;
  }>({
    isOpen: false,
    customer: null,
  });

  const [tagsModal, setTagsModal] = useState<{
    isOpen: boolean;
    customer: Customer | null;
  }>({
    isOpen: false,
    customer: null,
  });

  const [errorDetailsModal, setErrorDetailsModal] = useState<{
    isOpen: boolean;
    customer: Customer | null;
  }>({
    isOpen: false,
    customer: null,
  });

  const [requestDetailsModal, setRequestDetailsModal] = useState<{
    isOpen: boolean;
    customer: Customer | null;
    requestId?: string;
  }>({
    isOpen: false,
    customer: null,
    requestId: undefined,
  });

  // Details modal handlers
  const openDetailsModal = useCallback((customer: Customer) => {
    setDetailsModal({ isOpen: true, customer });
  }, []);

  const closeDetailsModal = useCallback(() => {
    setDetailsModal({ isOpen: false, customer: null });
  }, []);

  // Edit modal handlers
  const openEditModal = useCallback((customer: Customer) => {
    setEditModal({ isOpen: true, customer, mode: 'edit' });
  }, []);

  const openCreateModal = useCallback(() => {
    // Ensure clean state for create mode
    setEditModal({ isOpen: true, customer: null, mode: 'create' });
  }, []);

  const closeEditModal = useCallback(() => {
    setEditModal({ isOpen: false, customer: null, mode: 'edit' });
  }, []);

  // Notes modal handlers
  const openNotesModal = useCallback((customer: Customer) => {
    setNotesModal({ isOpen: true, customer });
  }, []);

  const closeNotesModal = useCallback(() => {
    setNotesModal({ isOpen: false, customer: null });
  }, []);

  // Analytics modal handlers
  const openAnalyticsModal = useCallback((customer: Customer) => {
    setAnalyticsModal({ isOpen: true, customer });
  }, []);

  const closeAnalyticsModal = useCallback(() => {
    setAnalyticsModal({ isOpen: false, customer: null });
  }, []);

  // History modal handlers
  const openHistoryModal = useCallback((customer: Customer) => {
    setHistoryModal({ isOpen: true, customer });
  }, []);

  const closeHistoryModal = useCallback(() => {
    setHistoryModal({ isOpen: false, customer: null });
  }, []);

  // Tags modal handlers
  const openTagsModal = useCallback((customer: Customer) => {
    setTagsModal({ isOpen: true, customer });
  }, []);

  const closeTagsModal = useCallback(() => {
    setTagsModal({ isOpen: false, customer: null });
  }, []);

  // Error details modal handlers
  const openErrorDetailsModal = useCallback((customer: Customer) => {
    setErrorDetailsModal({ isOpen: true, customer });
  }, []);

  const closeErrorDetailsModal = useCallback(() => {
    setErrorDetailsModal({ isOpen: false, customer: null });
  }, []);

  // Request details modal handlers
  const openRequestDetailsModal = useCallback((customer: Customer, requestId?: string) => {
    setRequestDetailsModal({ isOpen: true, customer, requestId });
  }, []);

  const closeRequestDetailsModal = useCallback(() => {
    setRequestDetailsModal({ isOpen: false, customer: null, requestId: undefined });
  }, []);

  // Handle customer save with real API call
  const handleCustomerSave = useCallback(
    async (updatedCustomer: Customer) => {
      if (!updateCustomer || !editModal.customer?.id) {
        closeEditModal();
        return;
      }

      try {
        // Extract only the changed fields from the full customer object
        const originalCustomer = editModal.customer;
        const changedFields: Partial<Customer> = {};

        // Compare each field and only include changed ones
        const fields: (keyof Customer)[] = [
          'firstName',
          'lastName',
          'email',
          'phone',
          'address',
          'notes',
          'tags',
        ];

        for (const field of fields) {
          if (updatedCustomer[field] !== originalCustomer[field]) {
            changedFields[field] = updatedCustomer[field];
          }
        }

        const result = await updateCustomer(editModal.customer.id, changedFields);
        if (result) {
          closeEditModal();
        } else {
          throw new Error('Update failed');
        }
      } catch (error) {
        // Re-throw to let CustomerEditModal handle it with user-friendly messaging
        throw error;
      }
    },
    [updateCustomer, editModal.customer, closeEditModal]
  );

  return {
    // Details modal
    detailsModal,
    openDetailsModal,
    closeDetailsModal,

    // Edit modal
    editModal,
    openEditModal,
    openCreateModal,
    closeEditModal,
    handleCustomerSave,

    // Notes modal
    notesModal,
    openNotesModal,
    closeNotesModal,

    // Analytics modal
    analyticsModal,
    openAnalyticsModal,
    closeAnalyticsModal,

    // History modal
    historyModal,
    openHistoryModal,
    closeHistoryModal,

    // Tags modal
    tagsModal,
    openTagsModal,
    closeTagsModal,

    // Error details modal
    errorDetailsModal,
    openErrorDetailsModal,
    closeErrorDetailsModal,

    // Request details modal
    requestDetailsModal,
    openRequestDetailsModal,
    closeRequestDetailsModal,
  };
}
