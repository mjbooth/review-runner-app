import { useState, useCallback } from 'react';

interface ConfirmationOptions {
  title: string;
  message: string;
  details?: string[];
  type?: 'warning' | 'danger' | 'info' | 'success';
  confirmText?: string;
  cancelText?: string;
  requireDoubleConfirm?: boolean;
  customerName?: string;
}

interface ConfirmationState extends ConfirmationOptions {
  isOpen: boolean;
  onConfirm: () => void;
}

export function useConfirmation() {
  const [confirmation, setConfirmation] = useState<ConfirmationState>({
    isOpen: false,
    title: '',
    message: '',
    details: [],
    type: 'warning',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    requireDoubleConfirm: false,
    onConfirm: () => {},
  });

  const showConfirmation = useCallback((options: ConfirmationOptions, onConfirm: () => void) => {
    setConfirmation({
      ...options,
      isOpen: true,
      onConfirm,
    });
  }, []);

  const hideConfirmation = useCallback(() => {
    setConfirmation(prev => ({
      ...prev,
      isOpen: false,
    }));
  }, []);

  const handleConfirm = useCallback(() => {
    confirmation.onConfirm();
    hideConfirmation();
  }, [confirmation.onConfirm, hideConfirmation]);

  return {
    confirmation,
    showConfirmation,
    hideConfirmation,
    handleConfirm,
  };
}
