import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchedulingOptions, type SchedulingConfig } from '../SchedulingOptions';

describe('SchedulingOptions', () => {
  const mockOnChange = jest.fn();

  const defaultConfig: SchedulingConfig = {
    type: 'immediate',
    timezone: 'Europe/London',
  };

  const defaultProps = {
    config: defaultConfig,
    onChange: mockOnChange,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-15T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Rendering', () => {
    it('should render send timing options', () => {
      render(<SchedulingOptions {...defaultProps} />);

      expect(screen.getByText('Send Timing')).toBeInTheDocument();
      expect(screen.getByText('Send Now')).toBeInTheDocument();
      expect(screen.getByText('Schedule')).toBeInTheDocument();
    });

    it('should highlight immediate option when selected', () => {
      render(<SchedulingOptions {...defaultProps} />);

      const sendNowButton = screen.getByText('Send Now').closest('button');
      expect(sendNowButton).toHaveClass('border-blue-500', 'bg-blue-50');
    });

    it('should highlight scheduled option when selected', () => {
      const scheduledConfig: SchedulingConfig = {
        type: 'scheduled',
        scheduledDateTime: new Date('2025-01-16T14:00:00Z'),
        timezone: 'Europe/London',
      };

      render(<SchedulingOptions {...defaultProps} config={scheduledConfig} />);

      const scheduleButton = screen.getByText('Schedule').closest('button');
      expect(scheduleButton).toHaveClass('border-blue-500', 'bg-blue-50');
    });

    it('should not show date/time inputs for immediate mode', () => {
      render(<SchedulingOptions {...defaultProps} />);

      expect(screen.queryByLabelText('Date')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Time')).not.toBeInTheDocument();
    });

    it('should show date/time inputs for scheduled mode', () => {
      const scheduledConfig: SchedulingConfig = {
        type: 'scheduled',
        scheduledDateTime: new Date('2025-01-16T14:00:00Z'),
        timezone: 'Europe/London',
      };

      render(<SchedulingOptions {...defaultProps} config={scheduledConfig} />);

      expect(screen.getByLabelText('Date')).toBeInTheDocument();
      expect(screen.getByLabelText('Time')).toBeInTheDocument();
    });

    it('should be disabled when disabled prop is true', () => {
      render(<SchedulingOptions {...defaultProps} disabled={true} />);

      const sendNowButton = screen.getByText('Send Now').closest('button');
      const scheduleButton = screen.getByText('Schedule').closest('button');

      expect(sendNowButton).toHaveClass('opacity-50', 'cursor-not-allowed');
      expect(scheduleButton).toHaveClass('opacity-50', 'cursor-not-allowed');
      expect(sendNowButton).toBeDisabled();
      expect(scheduleButton).toBeDisabled();
    });
  });

  describe('Type Selection', () => {
    it('should switch to immediate when Send Now is clicked', async () => {
      const user = userEvent.setup({ delay: null });
      const scheduledConfig: SchedulingConfig = {
        type: 'scheduled',
        scheduledDateTime: new Date('2025-01-16T14:00:00Z'),
        timezone: 'Europe/London',
      };

      render(<SchedulingOptions {...defaultProps} config={scheduledConfig} />);

      const sendNowButton = screen.getByText('Send Now').closest('button');
      await user.click(sendNowButton!);

      expect(mockOnChange).toHaveBeenCalledWith({
        type: 'immediate',
        timezone: 'Europe/London',
        scheduledDateTime: undefined,
      });
    });

    it('should switch to scheduled when Schedule is clicked', async () => {
      const user = userEvent.setup({ delay: null });
      render(<SchedulingOptions {...defaultProps} />);

      const scheduleButton = screen.getByText('Schedule').closest('button');
      await user.click(scheduleButton!);

      expect(mockOnChange).toHaveBeenCalledWith({
        type: 'scheduled',
        timezone: 'Europe/London',
        scheduledDateTime: expect.any(Date),
      });
    });
  });

  describe('Date/Time Input', () => {
    beforeEach(async () => {
      const user = userEvent.setup({ delay: null });
      render(<SchedulingOptions {...defaultProps} />);

      // Switch to scheduled mode
      const scheduleButton = screen.getByText('Schedule').closest('button');
      await user.click(scheduleButton!);
    });

    it('should initialize with tomorrow at 10 AM by default', async () => {
      const dateInput = screen.getByLabelText('Date') as HTMLInputElement;
      const timeInput = screen.getByLabelText('Time') as HTMLInputElement;

      expect(dateInput.value).toBe('2025-01-16');
      expect(timeInput.value).toBe('10:00');
    });

    it('should update date when changed', async () => {
      const user = userEvent.setup({ delay: null });
      const dateInput = screen.getByLabelText('Date');

      await user.clear(dateInput);
      await user.type(dateInput, '2025-01-20');

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'scheduled',
          scheduledDateTime: expect.any(Date),
        })
      );
    });

    it('should update time when changed', async () => {
      const user = userEvent.setup({ delay: null });
      const timeInput = screen.getByLabelText('Time');

      await user.clear(timeInput);
      await user.type(timeInput, '15:30');

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'scheduled',
          scheduledDateTime: expect.any(Date),
        })
      );
    });

    it('should show min and max date constraints', () => {
      const dateInput = screen.getByLabelText('Date') as HTMLInputElement;

      expect(dateInput.min).toBe('2025-01-15'); // Today
      expect(dateInput.max).toBe('2025-07-15'); // 6 months from now
    });
  });

  describe('Validation', () => {
    beforeEach(async () => {
      const user = userEvent.setup({ delay: null });
      render(<SchedulingOptions {...defaultProps} />);

      // Switch to scheduled mode
      const scheduleButton = screen.getByText('Schedule').closest('button');
      await user.click(scheduleButton!);
    });

    it('should show error for past dates', async () => {
      const user = userEvent.setup({ delay: null });
      const dateInput = screen.getByLabelText('Date');
      const timeInput = screen.getByLabelText('Time');

      await user.clear(dateInput);
      await user.type(dateInput, '2025-01-14'); // Yesterday
      await user.clear(timeInput);
      await user.type(timeInput, '10:00');

      await waitFor(() => {
        expect(screen.getByText('Scheduled time must be in the future')).toBeInTheDocument();
        const validationMessage = screen
          .getByText('Scheduled time must be in the future')
          .closest('div');
        expect(validationMessage).toHaveClass('text-red-600', 'bg-red-50', 'border-red-200');
      });
    });

    it('should show error for dates too far in future', async () => {
      const user = userEvent.setup({ delay: null });
      const dateInput = screen.getByLabelText('Date');

      await user.clear(dateInput);
      await user.type(dateInput, '2025-08-15'); // More than 6 months

      await waitFor(() => {
        expect(screen.getByText('Cannot schedule more than 6 months ahead')).toBeInTheDocument();
        const validationMessage = screen
          .getByText('Cannot schedule more than 6 months ahead')
          .closest('div');
        expect(validationMessage).toHaveClass('text-red-600', 'bg-red-50', 'border-red-200');
      });
    });

    it('should show warning for very soon scheduling', async () => {
      const user = userEvent.setup({ delay: null });
      const dateInput = screen.getByLabelText('Date');
      const timeInput = screen.getByLabelText('Time');

      await user.clear(dateInput);
      await user.type(dateInput, '2025-01-15'); // Today
      await user.clear(timeInput);
      await user.type(timeInput, '10:30'); // 30 minutes from now

      await waitFor(() => {
        expect(
          screen.getByText('Scheduled for very soon - consider using "Send Now" instead')
        ).toBeInTheDocument();
        const validationMessage = screen
          .getByText('Scheduled for very soon - consider using "Send Now" instead')
          .closest('div');
        expect(validationMessage).toHaveClass('text-amber-600', 'bg-amber-50', 'border-amber-200');
      });
    });

    it('should show warning for weekend scheduling', async () => {
      const user = userEvent.setup({ delay: null });
      const dateInput = screen.getByLabelText('Date');

      await user.clear(dateInput);
      await user.type(dateInput, '2025-01-18'); // Saturday

      await waitFor(() => {
        expect(
          screen.getByText('Scheduled for weekend - response rates may be lower')
        ).toBeInTheDocument();
        const validationMessage = screen
          .getByText('Scheduled for weekend - response rates may be lower')
          .closest('div');
        expect(validationMessage).toHaveClass('text-amber-600', 'bg-amber-50', 'border-amber-200');
      });
    });

    it('should show warning for outside business hours', async () => {
      const user = userEvent.setup({ delay: null });
      const dateInput = screen.getByLabelText('Date');
      const timeInput = screen.getByLabelText('Time');

      await user.clear(dateInput);
      await user.type(dateInput, '2025-01-16'); // Tomorrow
      await user.clear(timeInput);
      await user.type(timeInput, '20:00'); // 8 PM

      await waitFor(() => {
        expect(
          screen.getByText('Scheduled outside typical business hours (9 AM - 5 PM)')
        ).toBeInTheDocument();
        const validationMessage = screen
          .getByText('Scheduled outside typical business hours (9 AM - 5 PM)')
          .closest('div');
        expect(validationMessage).toHaveClass('text-amber-600', 'bg-amber-50', 'border-amber-200');
      });
    });

    it('should show time until send for valid scheduling', async () => {
      const user = userEvent.setup({ delay: null });
      const dateInput = screen.getByLabelText('Date');
      const timeInput = screen.getByLabelText('Time');

      await user.clear(dateInput);
      await user.type(dateInput, '2025-01-17'); // 2 days from now
      await user.clear(timeInput);
      await user.type(timeInput, '14:00'); // 2 PM

      await waitFor(() => {
        expect(screen.getByText(/Will be sent in 2 days and \d+ hours?/)).toBeInTheDocument();
        const validationMessage = screen
          .getByText(/Will be sent in 2 days and \d+ hours?/)
          .closest('div');
        expect(validationMessage).toHaveClass('text-green-600', 'bg-green-50', 'border-green-200');
      });
    });

    it('should show hours until send for same-day scheduling', async () => {
      const user = userEvent.setup({ delay: null });
      const dateInput = screen.getByLabelText('Date');
      const timeInput = screen.getByLabelText('Time');

      await user.clear(dateInput);
      await user.type(dateInput, '2025-01-15'); // Today
      await user.clear(timeInput);
      await user.type(timeInput, '16:00'); // 6 hours from now

      await waitFor(() => {
        expect(screen.getByText('Will be sent in 6 hours')).toBeInTheDocument();
      });
    });

    it('should show minutes until send for very soon scheduling', async () => {
      const user = userEvent.setup({ delay: null });
      const dateInput = screen.getByLabelText('Date');
      const timeInput = screen.getByLabelText('Time');

      await user.clear(dateInput);
      await user.type(dateInput, '2025-01-15'); // Today
      await user.clear(timeInput);
      await user.type(timeInput, '11:30'); // 1.5 hours from now

      await waitFor(() => {
        expect(screen.getByText(/Will be sent in \d+ minutes?/)).toBeInTheDocument();
      });
    });

    it('should not call onChange with invalid dates', async () => {
      const user = userEvent.setup({ delay: null });
      const dateInput = screen.getByLabelText('Date');
      const timeInput = screen.getByLabelText('Time');

      // Clear previous calls
      mockOnChange.mockClear();

      await user.clear(dateInput);
      await user.type(dateInput, '2025-01-14'); // Yesterday
      await user.clear(timeInput);
      await user.type(timeInput, '10:00');

      await waitFor(() => {
        expect(screen.getByText('Scheduled time must be in the future')).toBeInTheDocument();
      });

      // Should not have called onChange since date is invalid
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  describe('Timezone Display', () => {
    it('should display timezone information', async () => {
      const user = userEvent.setup({ delay: null });
      render(<SchedulingOptions {...defaultProps} />);

      const scheduleButton = screen.getByText('Schedule').closest('button');
      await user.click(scheduleButton!);

      expect(screen.getByText('Timezone: Europe/London')).toBeInTheDocument();
      expect(screen.getByText('UK Business Hours: 9 AM - 5 PM recommended')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty date input', async () => {
      const user = userEvent.setup({ delay: null });
      render(<SchedulingOptions {...defaultProps} />);

      const scheduleButton = screen.getByText('Schedule').closest('button');
      await user.click(scheduleButton!);

      const dateInput = screen.getByLabelText('Date');
      await user.clear(dateInput);

      await waitFor(() => {
        expect(screen.getByText('Please select both date and time')).toBeInTheDocument();
      });
    });

    it('should handle empty time input', async () => {
      const user = userEvent.setup({ delay: null });
      render(<SchedulingOptions {...defaultProps} />);

      const scheduleButton = screen.getByText('Schedule').closest('button');
      await user.click(scheduleButton!);

      const timeInput = screen.getByLabelText('Time');
      await user.clear(timeInput);

      await waitFor(() => {
        expect(screen.getByText('Please select both date and time')).toBeInTheDocument();
      });
    });

    it('should preserve existing scheduled date when provided', () => {
      const existingDate = new Date('2025-01-20T15:30:00Z');
      const scheduledConfig: SchedulingConfig = {
        type: 'scheduled',
        scheduledDateTime: existingDate,
        timezone: 'Europe/London',
      };

      render(<SchedulingOptions {...defaultProps} config={scheduledConfig} />);

      const dateInput = screen.getByLabelText('Date') as HTMLInputElement;
      const timeInput = screen.getByLabelText('Time') as HTMLInputElement;

      expect(dateInput.value).toBe('2025-01-20');
      expect(timeInput.value).toBe('15:30');
    });
  });
});
