'use client';

import React from 'react';

interface ModalOverlayProps {
  children: React.ReactNode;
  isOpen: boolean;
}

export function ModalOverlay({ children, isOpen }: ModalOverlayProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" aria-hidden="true" />

      {/* Modal Container */}
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        {children}
      </div>
    </div>
  );
}
