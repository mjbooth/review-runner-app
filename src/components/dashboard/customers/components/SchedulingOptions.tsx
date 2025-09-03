'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Calendar, AlertCircle, CheckCircle, Globe } from '@/components/ui/icons';

export interface SchedulingConfig {
  type: 'immediate' | 'scheduled';
  scheduledDateTime?: Date;
  timezone: string;
}

interface SchedulingOptionsProps {
  config: SchedulingConfig;
  onChange: (config: SchedulingConfig) => void;
  disabled?: boolean;
  className?: string;
}

export function SchedulingOptions({
  config,
  onChange,
  disabled = false,
  className = '',
}: SchedulingOptionsProps) {
  const [dateInput, setDateInput] = useState('');
  const [timeInput, setTimeInput] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [validationLevel, setValidationLevel] = useState<'info' | 'warning' | 'error'>('info');
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize inputs from config (only once)
  useEffect(() => {
    if (!isInitialized) {
      if (config.scheduledDateTime) {
        const date = new Date(config.scheduledDateTime);
        setDateInput(date.toISOString().split('T')[0]);
        setTimeInput(date.toTimeString().slice(0, 5));
      } else {
        // Set default to tomorrow at 10 AM
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        setDateInput(tomorrow.toISOString().split('T')[0]);
        setTimeInput('10:00');
      }
      setIsInitialized(true);
    }
  }, [config.scheduledDateTime, isInitialized]);

  // Validation function (no useCallback to avoid dependency issues)
  const validateDateTime = (dateStr: string, timeStr: string) => {
    if (!dateStr || !timeStr) {
      return {
        isValid: false,
        message: 'Please select both date and time',
        level: 'error' as const,
      };
    }

    const selectedDateTime = new Date(`${dateStr}T${timeStr}`);
    const now = new Date();
    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

    // Check if date is in the past
    if (selectedDateTime <= now) {
      return {
        isValid: false,
        message: 'Scheduled time must be in the future',
        level: 'error' as const,
      };
    }

    // Check if date is too far in the future
    if (selectedDateTime > sixMonthsFromNow) {
      return {
        isValid: false,
        message: 'Cannot schedule more than 6 months ahead',
        level: 'error' as const,
      };
    }

    // Check if it's within the next hour (warning)
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    if (selectedDateTime < oneHourFromNow) {
      return {
        isValid: true,
        message: 'Scheduled for very soon - consider using "Send Now" instead',
        level: 'warning' as const,
      };
    }

    // Check if it's on a weekend
    const dayOfWeek = selectedDateTime.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return {
        isValid: true,
        message: 'Scheduled for weekend - response rates may be lower',
        level: 'warning' as const,
      };
    }

    // Check if it's outside business hours (before 9 AM or after 5 PM)
    const hour = selectedDateTime.getHours();
    if (hour < 9 || hour >= 17) {
      return {
        isValid: true,
        message: 'Scheduled outside typical business hours (9 AM - 5 PM)',
        level: 'warning' as const,
      };
    }

    // All good - show time until send
    const timeUntilSend = selectedDateTime.getTime() - now.getTime();
    const minutesUntilSend = Math.floor(timeUntilSend / (1000 * 60));
    const hoursUntilSend = Math.floor(minutesUntilSend / 60);
    const daysUntilSend = Math.floor(hoursUntilSend / 24);

    if (daysUntilSend > 0) {
      return {
        isValid: true,
        message: `Will be sent in ${daysUntilSend} day${daysUntilSend > 1 ? 's' : ''} and ${hoursUntilSend % 24} hour${hoursUntilSend % 24 !== 1 ? 's' : ''}`,
        level: 'info' as const,
      };
    } else if (hoursUntilSend > 0) {
      return {
        isValid: true,
        message: `Will be sent in ${hoursUntilSend} hour${hoursUntilSend !== 1 ? 's' : ''}`,
        level: 'info' as const,
      };
    } else {
      return {
        isValid: true,
        message: `Will be sent in ${Math.max(1, minutesUntilSend)} minute${minutesUntilSend !== 1 ? 's' : ''}`,
        level: 'info' as const,
      };
    }
  };

  // Handle date input change
  const handleDateChange = (newDate: string) => {
    setDateInput(newDate);
    if (newDate && timeInput && config.type === 'scheduled') {
      const validation = validateDateTime(newDate, timeInput);
      setValidationMessage(validation.message);
      setValidationLevel(validation.level);

      if (validation.isValid) {
        const scheduledDateTime = new Date(`${newDate}T${timeInput}`);
        onChange({
          ...config,
          scheduledDateTime,
        });
      }
    }
  };

  // Handle time input change
  const handleTimeChange = (newTime: string) => {
    setTimeInput(newTime);
    if (dateInput && newTime && config.type === 'scheduled') {
      const validation = validateDateTime(dateInput, newTime);
      setValidationMessage(validation.message);
      setValidationLevel(validation.level);

      if (validation.isValid) {
        const scheduledDateTime = new Date(`${dateInput}T${newTime}`);
        onChange({
          ...config,
          scheduledDateTime,
        });
      }
    }
  };

  // Update validation when type changes
  useEffect(() => {
    if (config.type === 'scheduled' && dateInput && timeInput && isInitialized) {
      const validation = validateDateTime(dateInput, timeInput);
      setValidationMessage(validation.message);
      setValidationLevel(validation.level);
    } else if (config.type === 'immediate') {
      setValidationMessage(null);
    }
  }, [config.type, isInitialized]); // Only depend on type and initialization

  const handleTypeChange = (type: 'immediate' | 'scheduled') => {
    if (type === 'immediate') {
      onChange({
        ...config,
        type: 'immediate',
        scheduledDateTime: undefined,
      });
    } else {
      // When switching to scheduled, use current date/time inputs
      const scheduledDateTime = new Date(`${dateInput}T${timeInput}`);
      onChange({
        ...config,
        type: 'scheduled',
        scheduledDateTime,
      });
    }
  };

  const getValidationIcon = () => {
    switch (validationLevel) {
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
      case 'info':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      default:
        return null;
    }
  };

  const getValidationColorClasses = () => {
    switch (validationLevel) {
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'warning':
        return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'info':
        return 'text-green-600 bg-green-50 border-green-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  // Get minimum date (today)
  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Get maximum date (6 months from now)
  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 6);
    return maxDate.toISOString().split('T')[0];
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Scheduling Type Selection */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Send Timing
        </label>

        <div className="grid grid-cols-2 gap-3">
          {/* Send Now Option */}
          <button
            type="button"
            onClick={() => handleTypeChange('immediate')}
            disabled={disabled}
            className={`
              relative p-3 border-2 rounded-lg transition-all duration-200 text-left
              ${
                config.type === 'immediate'
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${config.type === 'immediate' ? 'bg-blue-500' : 'bg-gray-300'}`}
                />
                <span className="font-medium text-gray-900">Send Now</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">Send immediately after creation</p>
          </button>

          {/* Schedule Option */}
          <button
            type="button"
            onClick={() => handleTypeChange('scheduled')}
            disabled={disabled}
            className={`
              relative p-3 border-2 rounded-lg transition-all duration-200 text-left
              ${
                config.type === 'scheduled'
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${config.type === 'scheduled' ? 'bg-blue-500' : 'bg-gray-300'}`}
                />
                <span className="font-medium text-gray-900">Schedule</span>
              </div>
              <Calendar className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-xs text-gray-500 mt-1">Schedule for specific date and time</p>
          </button>
        </div>
      </div>

      {/* Scheduled DateTime Inputs */}
      {config.type === 'scheduled' && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Calendar className="w-4 h-4" />
            Schedule Details
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Date Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={dateInput}
                onChange={e => handleDateChange(e.target.value)}
                min={getMinDate()}
                max={getMaxDate()}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Time Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
              <input
                type="time"
                value={timeInput}
                onChange={e => handleTimeChange(e.target.value)}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Timezone Display */}
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-white border border-gray-200 rounded-md px-3 py-2">
            <Globe className="w-3 h-3" />
            <span>Timezone: {config.timezone}</span>
            <span className="text-gray-400">|</span>
            <span>UK Business Hours: 9 AM - 5 PM recommended</span>
          </div>

          {/* Validation Message */}
          {validationMessage && (
            <div
              className={`flex items-start gap-2 text-sm p-3 border rounded-md ${getValidationColorClasses()}`}
            >
              {getValidationIcon()}
              <span className="flex-1">{validationMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SchedulingOptions;
