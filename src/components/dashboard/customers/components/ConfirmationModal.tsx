'use client';

import React from 'react';
import { Modal } from './Modal';
import { AlertTriangle, XCircle, CheckCircle, Info } from '@/components/ui/icons';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  details?: string[];
  type?: 'warning' | 'danger' | 'info' | 'success';
  confirmText?: string;
  cancelText?: string;
  requireDoubleConfirm?: boolean;
  customerName?: string;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  details = [],
  type = 'warning',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  requireDoubleConfirm = false,
  customerName,
}: ConfirmationModalProps) {
  const [confirmationText, setConfirmationText] = React.useState('');
  const [step, setStep] = React.useState<'initial' | 'final'>(
    requireDoubleConfirm ? 'initial' : 'final'
  );

  React.useEffect(() => {
    if (isOpen) {
      setStep(requireDoubleConfirm ? 'initial' : 'final');
      setConfirmationText('');
    }
  }, [isOpen, requireDoubleConfirm]);

  const getIcon = () => {
    switch (type) {
      case 'danger':
        return <XCircle className="w-8 h-8 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-8 h-8 text-yellow-600" />;
      case 'success':
        return <CheckCircle className="w-8 h-8 text-green-600" />;
      case 'info':
      default:
        return <Info className="w-8 h-8 text-blue-600" />;
    }
  };

  const getColorClasses = () => {
    switch (type) {
      case 'danger':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-900',
          button: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
        };
      case 'warning':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-900',
          button: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
        };
      case 'success':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-900',
          button: 'bg-green-600 hover:bg-green-700 focus:ring-green-500',
        };
      case 'info':
      default:
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-900',
          button: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
        };
    }
  };

  const colors = getColorClasses();
  const expectedConfirmText = customerName ? `DELETE ${customerName.toUpperCase()}` : 'CONFIRM';
  const isConfirmationValid = confirmationText === expectedConfirmText;

  const handleInitialConfirm = () => {
    if (requireDoubleConfirm) {
      setStep('final');
    } else {
      onConfirm();
    }
  };

  const handleFinalConfirm = () => {
    if (requireDoubleConfirm && !isConfirmationValid) {
      return;
    }
    onConfirm();
  };

  const renderInitialStep = () => (
    <>
      {/* Header */}
      <div
        className={`flex items-start space-x-4 p-6 ${colors.bg} ${colors.border} border rounded-t-lg`}
      >
        {getIcon()}
        <div className="flex-1">
          <h3 className={`text-lg font-semibold ${colors.text}`}>{title}</h3>
          <p className={`mt-2 text-sm ${colors.text}`}>{message}</p>
        </div>
      </div>

      {/* Details */}
      {details.length > 0 && (
        <div className="px-6 py-4 bg-gray-50 border-x">
          <h4 className="text-sm font-medium text-gray-900 mb-2">This action will:</h4>
          <ul className="space-y-1">
            {details.map((detail, index) => (
              <li key={index} className="text-sm text-gray-700 flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end space-x-3 px-6 py-4 bg-gray-50 border-x border-b rounded-b-lg">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
        >
          {cancelText}
        </button>
        <button
          onClick={handleInitialConfirm}
          className={`px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 ${colors.button}`}
        >
          Continue
        </button>
      </div>
    </>
  );

  const renderFinalStep = () => (
    <>
      {/* Header */}
      <div
        className={`flex items-start space-x-4 p-6 ${colors.bg} ${colors.border} border rounded-t-lg`}
      >
        <XCircle className="w-8 h-8 text-red-600" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-red-900">Final Confirmation Required</h3>
          <p className="mt-2 text-sm text-red-800">
            {requireDoubleConfirm && customerName
              ? `Type "${expectedConfirmText}" to confirm this permanent action.`
              : 'This is your final chance to cancel this action.'}
          </p>
        </div>
      </div>

      {/* Confirmation Input */}
      {requireDoubleConfirm && customerName && (
        <div className="px-6 py-4 bg-gray-50 border-x">
          <label htmlFor="confirmation" className="block text-sm font-medium text-gray-700 mb-2">
            Type "{expectedConfirmText}" to confirm:
          </label>
          <input
            id="confirmation"
            type="text"
            value={confirmationText}
            onChange={e => setConfirmationText(e.target.value)}
            placeholder={expectedConfirmText}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm"
          />
          {confirmationText && !isConfirmationValid && (
            <p className="mt-1 text-xs text-red-600">
              Text does not match. Please type exactly: {expectedConfirmText}
            </p>
          )}
        </div>
      )}

      {/* Warning */}
      <div className="px-6 py-4 bg-red-50 border-x border-red-200">
        <div className="flex items-start space-x-2">
          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-800">
            <strong>Warning:</strong> This action cannot be undone and will take effect immediately.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end space-x-3 px-6 py-4 bg-gray-50 border-x border-b rounded-b-lg">
        <button
          onClick={() => (requireDoubleConfirm ? setStep('initial') : onClose)}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
        >
          {requireDoubleConfirm ? 'Back' : cancelText}
        </button>
        <button
          onClick={handleFinalConfirm}
          disabled={requireDoubleConfirm && !isConfirmationValid}
          className={`px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${colors.button}`}
        >
          {confirmText}
        </button>
      </div>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" showHeader={false} size="md">
      <div className="space-y-0">
        {step === 'initial' ? renderInitialStep() : renderFinalStep()}
      </div>
    </Modal>
  );
}
