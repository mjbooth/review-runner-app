import { useState, useCallback, useEffect } from 'react';
import { type Customer } from '../types';
import { useConfirmation } from './useConfirmation';

interface ContextMenuState {
  isVisible: boolean;
  x: number;
  y: number;
  customer: Customer | null;
}

interface ContextMenuOptions {
  onViewDetails?: (customer: Customer) => void;
  onEditCustomer?: (customer: Customer) => void;
  onSendReviewRequest?: (customer: Customer) => void;
  onScheduleReview?: (customer: Customer) => void;
  onShowNotes?: (customer: Customer) => void;
  onShowAnalytics?: (customer: Customer) => void;
  onShowHistory?: (customer: Customer) => void;
  onManageTags?: (customer: Customer) => void;
  onShowRequestDetails?: (customer: Customer) => void;
  onShowErrorDetails?: (customer: Customer) => void;
  onRefreshData?: () => void;
}

export function useContextMenu(options?: ContextMenuOptions) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isVisible: false,
    x: 0,
    y: 0,
    customer: null,
  });

  const { confirmation, showConfirmation, hideConfirmation, handleConfirm } = useConfirmation();

  // Helper function to handle API responses and parse errors safely
  const handleApiResponse = async (response: Response, defaultErrorMessage: string) => {
    if (response.ok) {
      try {
        return await response.json();
      } catch (error) {
        // If response is ok but not JSON, return success
        return { success: true };
      }
    } else {
      let errorMessage = defaultErrorMessage;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || defaultErrorMessage;
      } catch (parseError) {
        // If response is not JSON, use status text
        errorMessage = `Server error (${response.status}): ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }
  };

  // Handle right-click to show context menu
  const handleContextMenu = useCallback((event: React.MouseEvent, customer: Customer) => {
    event.preventDefault();
    event.stopPropagation();

    // Store initial click position - we'll handle viewport positioning in the component
    const x = event.clientX;
    const y = event.clientY;

    // Always set the new context menu (this will replace any existing one)
    setContextMenu({
      isVisible: true,
      x,
      y,
      customer,
    });
  }, []);

  // Handle closing the context menu
  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(prev => ({
      ...prev,
      isVisible: false,
    }));
  }, []);

  // Handle context menu actions
  const handleContextMenuAction = useCallback(
    async (action: string, customer: Customer) => {
      console.log('Context menu action:', action, customer);

      try {
        switch (action) {
          // Phase 1 - Essential Actions
          case 'view-details':
            options?.onViewDetails?.(customer);
            break;

          case 'edit-customer':
          case 'complete-info':
          case 'fix-contact-info':
            options?.onEditCustomer?.(customer);
            break;

          case 'send-review':
            options?.onSendReviewRequest?.(customer);
            break;

          case 'schedule-review':
            options?.onScheduleReview?.(customer);
            break;

          case 'cancel-request':
            await handleCancelRequest(customer);
            break;

          case 'send-now':
            await handleSendNow(customer);
            break;

          case 'reschedule':
            await handleReschedule(customer);
            break;

          case 'add-suppression':
            await handleAddSuppression(customer);
            break;

          case 'delete-customer':
            await handleDeleteCustomer(customer);
            break;

          // Phase 2 - Important Actions
          case 'mark-completed':
            await handleMarkCompleted(customer);
            break;

          case 'send-followup':
          case 'send-new-campaign':
          case 'resend-review':
          case 'resend-followup':
            options?.onSendReviewRequest?.(customer);
            break;

          case 'add-notes':
            options?.onShowNotes?.(customer);
            break;

          case 'view-analytics':
          case 'view-full-analytics':
            options?.onShowAnalytics?.(customer);
            break;

          case 'view-request-details':
            options?.onShowRequestDetails?.(customer);
            break;

          case 'edit-message':
            await handleEditMessage(customer);
            break;

          // Phase 3 - Advanced Actions
          case 'switch-channel':
            await handleSwitchChannel(customer);
            break;

          case 'retry-send':
          case 'retry-followup':
            await handleRetrySend(customer);
            break;

          case 'view-error-details':
            options?.onShowErrorDetails?.(customer);
            break;

          case 'add-vip':
            await handleAddVIP(customer);
            break;

          case 'schedule-followup':
          case 'schedule-another-followup':
            await handleScheduleFollowup(customer);
            break;

          case 'reset-future':
            await handleResetFuture(customer);
            break;

          // Universal Actions
          case 'view-history':
            options?.onShowHistory?.(customer);
            break;

          case 'manage-tags':
            options?.onManageTags?.(customer);
            break;

          case 'export-data':
            await handleExportData(customer);
            break;

          default:
            console.warn('Unknown context menu action:', action);
            showNotification(`Action "${action}" is not implemented yet`, 'info');
        }
      } catch (error) {
        console.error('Error handling context menu action:', error);
        showNotification(
          `Failed to ${action.replace('-', ' ')}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error'
        );
      }
    },
    [options]
  );

  // Action handlers
  const handleCancelRequest = async (customer: Customer) => {
    try {
      // Debug: Test simple endpoint first
      console.log('Debug: Testing simple endpoint');
      const simpleResponse = await fetch('/api/debug/simple-test');
      const simpleData = await simpleResponse.json();
      console.log('Simple test response:', simpleData);

      // Debug: Test auth endpoint
      console.log('Debug: Testing auth endpoint');
      const authResponse = await fetch('/api/debug/auth-test');
      const authData = await authResponse.json();
      console.log('Auth test response:', authData);

      // Debug: Test database endpoint
      console.log('Debug: Testing database endpoint');
      const dbResponse = await fetch('/api/debug/db-test');
      const dbData = await dbResponse.json();
      console.log('Database test response:', dbData);

      // First, find the scheduled request to get details
      const response = await fetch(`/api/customers/${customer.id}/requests?status=QUEUED`);
      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);

      // Let's see the raw response
      const responseText = await response.text();
      console.log('Raw response:', responseText);

      // Try to parse as JSON
      let data;
      try {
        data = JSON.parse(responseText);
        console.log('Parsed JSON:', data);
      } catch (parseError) {
        console.error('Failed to parse JSON:', parseError);
        showNotification('Server returned invalid response', 'error');
        return;
      }

      if (!data.success || !data.data?.length) {
        showNotification('No scheduled request found to cancel', 'warning');
        return;
      }

      const scheduledRequest = data.data[0];
      const scheduledDate = scheduledRequest.scheduledFor
        ? new Date(scheduledRequest.scheduledFor).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'Not specified';

      // Show confirmation dialog with detailed information
      showConfirmation(
        {
          title: 'Cancel Review Request',
          message: `You are about to cancel the scheduled review request for ${customer.firstName} ${customer.lastName}.`,
          details: [
            `Customer: ${customer.firstName} ${customer.lastName} (${customer.email})`,
            `Channel: ${scheduledRequest.channel}`,
            `Scheduled for: ${scheduledDate}`,
            'Remove the request from the sending queue',
            'This action cannot be undone',
          ],
          type: 'warning',
          confirmText: 'Cancel Request',
          cancelText: 'Keep Request',
          requireDoubleConfirm: true,
        },
        async () => {
          try {
            const cancelResponse = await fetch(
              `/api/review-requests/scheduled/${scheduledRequest.id}`,
              {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'cancel' }),
              }
            );

            await handleApiResponse(cancelResponse, 'Failed to cancel request');
            showNotification(
              `Review request for ${customer.firstName} ${customer.lastName} cancelled successfully`,
              'success'
            );
            options?.onRefreshData?.();
          } catch (error) {
            console.error('Failed to cancel request:', error);
            showNotification(
              `Failed to cancel request: ${error instanceof Error ? error.message : 'Unknown error'}`,
              'error'
            );
          }
        }
      );
    } catch (error) {
      console.error('Error loading request details:', error);
      showNotification(
        `Failed to load request details: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
    }
  };

  const handleSendNow = async (customer: Customer) => {
    if (
      !confirm(`Send the review request immediately to ${customer.firstName} ${customer.lastName}?`)
    ) {
      return;
    }

    try {
      // Find the scheduled request and convert to immediate
      const response = await fetch(`/api/customers/${customer.id}/requests?status=QUEUED`);
      const data = await handleApiResponse(response, 'Failed to fetch scheduled requests');

      if (data.success && data.data?.length > 0) {
        const scheduledRequest = data.data[0];
        const sendResponse = await fetch(`/api/review-requests/${scheduledRequest.id}/send-now`, {
          method: 'POST',
        });

        await handleApiResponse(sendResponse, 'Failed to send request immediately');
        showNotification('Review request sent immediately', 'success');
        options?.onRefreshData?.();
      } else {
        showNotification('No scheduled request found', 'warning');
      }
    } catch (error) {
      console.error('Failed to send request immediately:', error);
      showNotification(
        `Failed to send request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
    }
  };

  const handleReschedule = async (customer: Customer) => {
    try {
      // Find the scheduled request
      const response = await fetch(`/api/customers/${customer.id}/requests?status=QUEUED`);
      const data = await handleApiResponse(response, 'Failed to fetch scheduled requests');

      if (data.success && data.data?.length > 0) {
        const scheduledRequest = data.data[0];
        const newDateTime = prompt(
          'Enter new date/time (YYYY-MM-DD HH:MM):',
          scheduledRequest.scheduledFor
            ? new Date(scheduledRequest.scheduledFor).toISOString().slice(0, 16).replace('T', ' ')
            : ''
        );

        if (newDateTime) {
          const rescheduleResponse = await fetch(
            `/api/review-requests/scheduled/${scheduledRequest.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'reschedule',
                scheduledFor: new Date(newDateTime.replace(' ', 'T')).toISOString(),
              }),
            }
          );

          await handleApiResponse(rescheduleResponse, 'Failed to reschedule request');
          showNotification('Review request rescheduled successfully', 'success');
          options?.onRefreshData?.();
        }
      } else {
        showNotification('No scheduled request found to reschedule', 'warning');
      }
    } catch (error) {
      console.error('Failed to reschedule request:', error);
      showNotification(
        `Failed to reschedule request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
    }
  };

  const handleAddSuppression = async (customer: Customer) => {
    const reason = prompt(
      `Add ${customer.firstName} ${customer.lastName} to suppression list?\n\nReason (optional):`
    );
    if (reason !== null) {
      try {
        const response = await fetch('/api/suppressions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact: customer.email,
            channel: 'EMAIL',
            reason: 'USER_REQUEST',
            source: 'manual',
            notes: reason || undefined,
          }),
        });

        await handleApiResponse(response, 'Failed to add suppression');
        showNotification('Customer added to suppression list', 'success');
        options?.onRefreshData?.();
      } catch (error) {
        console.error('Failed to add suppression:', error);
        showNotification(
          `Failed to add suppression: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error'
        );
      }
    }
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    showConfirmation(
      {
        title: 'Delete Customer',
        message: `You are about to permanently delete ${customer.firstName} ${customer.lastName} and all associated data.`,
        details: [
          'Delete all customer information and contact details',
          'Remove all review request history',
          'Delete any notes or tags associated with this customer',
          'Remove from all campaigns and workflows',
          'This action cannot be undone and data cannot be recovered',
        ],
        type: 'danger',
        confirmText: 'Delete Customer',
        cancelText: 'Cancel',
        requireDoubleConfirm: true,
        customerName: `${customer.firstName} ${customer.lastName}`,
      },
      async () => {
        try {
          const response = await fetch(`/api/customers/${customer.id}`, {
            method: 'DELETE',
          });

          await handleApiResponse(response, 'Failed to delete customer');
          showNotification('Customer deleted successfully', 'success');
          options?.onRefreshData?.();
        } catch (error) {
          console.error('Failed to delete customer:', error);
          showNotification(
            `Failed to delete customer: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'error'
          );
        }
      }
    );
  };

  const handleMarkCompleted = async (customer: Customer) => {
    await fetch(`/api/customers/${customer.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'Completed',
      }),
    });

    showNotification('Customer marked as completed', 'success');
    options?.onRefreshData?.();
  };

  const handleEditMessage = async (customer: Customer) => {
    // Find the scheduled request
    const response = await fetch(`/api/customers/${customer.id}/requests?status=QUEUED`);
    const data = await response.json();

    if (data.success && data.data?.length > 0) {
      // Open the review request modal for editing
      options?.onSendReviewRequest?.(customer);
    } else {
      showNotification('No scheduled message found to edit', 'warning');
    }
  };

  const handleSwitchChannel = async (customer: Customer) => {
    const currentChannel = customer.channel === 'email' ? 'SMS' : 'EMAIL';
    if (
      confirm(
        `Switch communication channel to ${currentChannel} for ${customer.firstName} ${customer.lastName}?`
      )
    ) {
      await fetch(`/api/customers/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: currentChannel.toLowerCase(),
        }),
      });

      showNotification(`Channel switched to ${currentChannel}`, 'success');
      options?.onRefreshData?.();
    }
  };

  const handleRetrySend = async (customer: Customer) => {
    if (
      confirm(`Retry sending the review request to ${customer.firstName} ${customer.lastName}?`)
    ) {
      await fetch(`/api/customers/${customer.id}/retry`, {
        method: 'POST',
      });

      showNotification('Review request retry initiated', 'success');
      options?.onRefreshData?.();
    }
  };

  const handleAddVIP = async (customer: Customer) => {
    await fetch(`/api/customers/${customer.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vipStatus: true,
      }),
    });

    showNotification('Customer added to VIP list', 'success');
    options?.onRefreshData?.();
  };

  const handleScheduleFollowup = async (customer: Customer) => {
    const days = prompt('Schedule follow-up in how many days?', '7');
    if (days && !isNaN(parseInt(days))) {
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + parseInt(days));

      await fetch('/api/review-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          channel: customer.channel?.toUpperCase() || 'EMAIL',
          templateType: 'followup',
          scheduledFor: scheduledDate.toISOString(),
        }),
      });

      showNotification(`Follow-up scheduled for ${days} days`, 'success');
      options?.onRefreshData?.();
    }
  };

  const handleResetFuture = async (customer: Customer) => {
    if (confirm(`Reset ${customer.firstName} ${customer.lastName} for future campaigns?`)) {
      await fetch(`/api/customers/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Ready',
          lastRequest: null,
        }),
      });

      showNotification('Customer reset for future campaigns', 'success');
      options?.onRefreshData?.();
    }
  };

  const handleExportData = async (customer: Customer) => {
    const response = await fetch(`/api/customers/${customer.id}/export`);
    const data = await response.json();

    if (data.success) {
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `customer-${customer.firstName}-${customer.lastName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showNotification('Customer data exported', 'success');
    }
  };

  // Simple notification system
  const showNotification = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    // Create a simple toast notification
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-white max-w-sm ${
      type === 'success'
        ? 'bg-green-600'
        : type === 'error'
          ? 'bg-red-600'
          : type === 'warning'
            ? 'bg-yellow-600'
            : 'bg-blue-600'
    }`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  };

  // Close context menu when clicking elsewhere or pressing Escape
  // Also prevent browser context menu when our menu is open
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.isVisible) {
        handleCloseContextMenu();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && contextMenu.isVisible) {
        handleCloseContextMenu();
      }
    };

    const handleContextMenuGlobal = (event: MouseEvent) => {
      if (contextMenu.isVisible) {
        // Prevent browser context menu when our menu is already open
        event.preventDefault();
        event.stopPropagation();
        // Close the existing context menu
        handleCloseContextMenu();
      }
    };

    if (contextMenu.isVisible) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('contextmenu', handleContextMenuGlobal);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenuGlobal);
    };
  }, [contextMenu.isVisible, handleCloseContextMenu]);

  return {
    contextMenu,
    handleContextMenu,
    handleCloseContextMenu,
    handleContextMenuAction,
    confirmation,
    hideConfirmation,
    handleConfirm,
  };
}
