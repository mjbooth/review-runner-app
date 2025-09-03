import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateReviewRequestModal } from '../CreateReviewRequestModal';
import { reviewRequestService } from '../../services/reviewRequestService';
import { MESSAGE_TEMPLATES } from '../../data/messageTemplates';
import type { Customer } from '../../types';

// Mock dependencies
jest.mock('../../services/reviewRequestService');
jest.mock('../../data/messageTemplates', () => ({
  MESSAGE_TEMPLATES: [
    {
      id: 'template-1',
      name: 'Initial Review Request',
      description: 'Initial review request template',
      channel: 'SMS',
      subject: '',
      content: 'Hi {{firstName}}, please review us at {{reviewUrl}}',
      category: 'initial',
      tags: ['initial'],
      characterCount: 50,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'template-2',
      name: 'Email Review Request',
      description: 'Email review request template',
      channel: 'EMAIL',
      subject: 'Review Request from {{businessName}}',
      content: 'Dear {{firstName}}, we would appreciate your review.',
      category: 'initial',
      tags: ['initial', 'email'],
      characterCount: 100,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
}));

describe('CreateReviewRequestModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSend = jest.fn();
  const mockOnReviewRequestsCreated = jest.fn();

  const mockCustomer: Customer = {
    id: 'customer-1',
    businessId: 'business-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+447123456789',
    source: 'MANUAL',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCustomers: Customer[] = [
    mockCustomer,
    {
      id: 'customer-2',
      businessId: 'business-1',
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@example.com',
      phone: '+447987654321',
      source: 'MANUAL',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    customer: mockCustomer,
    onSend: mockOnSend,
    onReviewRequestsCreated: mockOnReviewRequestsCreated,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (reviewRequestService.createReviewRequests as jest.Mock).mockResolvedValue({
      requests: [],
      totalRequests: 1,
      successfulRequests: 1,
      failedRequests: 0,
      errors: [],
    });
  });

  describe('Modal Rendering', () => {
    it('should render when isOpen is true', () => {
      render(<CreateReviewRequestModal {...defaultProps} />);

      expect(screen.getByText('Send Review Request to John Doe')).toBeInTheDocument();
      expect(screen.getByText('Choose Template')).toBeInTheDocument();
    });

    it('should not render when isOpen is false', () => {
      render(<CreateReviewRequestModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByText('Send Review Request to John Doe')).not.toBeInTheDocument();
    });

    it('should show error when no customer is selected', () => {
      render(<CreateReviewRequestModal {...defaultProps} customer={null} selectedCustomers={[]} />);

      expect(screen.getByText('No Customer Selected')).toBeInTheDocument();
      expect(
        screen.getByText('Please select a customer to send a review request.')
      ).toBeInTheDocument();
    });

    it('should show bulk selection UI for multiple customers', () => {
      const selectedCustomerIds = new Set(['customer-1', 'customer-2']);
      render(
        <CreateReviewRequestModal
          {...defaultProps}
          customer={null}
          customers={mockCustomers}
          selectedCustomerIds={selectedCustomerIds}
        />
      );

      expect(screen.getByText('Send Bulk Review Request (2 recipients)')).toBeInTheDocument();
      expect(screen.getByText('Bulk Review Request (2 customers)')).toBeInTheDocument();
    });
  });

  describe('Template Selection (Step 1)', () => {
    it('should display available templates', () => {
      render(<CreateReviewRequestModal {...defaultProps} />);

      expect(screen.getByText('Initial Review Request')).toBeInTheDocument();
      expect(screen.getByText('Email Review Request')).toBeInTheDocument();
    });

    it('should filter templates by channel', async () => {
      const user = userEvent.setup();
      render(<CreateReviewRequestModal {...defaultProps} />);

      const smsFilter = screen.getByRole('button', { name: /SMS/i });
      await user.click(smsFilter);

      expect(screen.getByText('Initial Review Request')).toBeInTheDocument();
      expect(screen.queryByText('Email Review Request')).not.toBeInTheDocument();
    });

    it('should filter templates by search query', async () => {
      const user = userEvent.setup();
      render(<CreateReviewRequestModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search templates...');
      await user.type(searchInput, 'Email');

      expect(screen.queryByText('Initial Review Request')).not.toBeInTheDocument();
      expect(screen.getByText('Email Review Request')).toBeInTheDocument();
    });

    it('should select a template when clicked', async () => {
      const user = userEvent.setup();
      render(<CreateReviewRequestModal {...defaultProps} />);

      const template = screen.getByText('Initial Review Request').closest('div[class*="border-2"]');
      await user.click(template!);

      expect(template).toHaveClass('border-forgedorange-500');
    });

    it('should enable continue button when template is selected', async () => {
      const user = userEvent.setup();
      render(<CreateReviewRequestModal {...defaultProps} />);

      const continueButton = screen.getByText('Continue to Compose');
      expect(continueButton).toBeDisabled();

      const template = screen.getByText('Initial Review Request').closest('div[class*="border-2"]');
      await user.click(template!);

      expect(continueButton).toBeEnabled();
    });

    it('should proceed to compose step when continue is clicked', async () => {
      const user = userEvent.setup();
      render(<CreateReviewRequestModal {...defaultProps} />);

      const template = screen.getByText('Initial Review Request').closest('div[class*="border-2"]');
      await user.click(template!);

      const continueButton = screen.getByText('Continue to Compose');
      await user.click(continueButton);

      expect(screen.getByText('Compose Message')).toBeInTheDocument();
    });
  });

  describe('Message Composition (Step 2)', () => {
    beforeEach(async () => {
      const user = userEvent.setup();
      render(<CreateReviewRequestModal {...defaultProps} />);

      // Select template and continue
      const template = screen.getByText('Initial Review Request').closest('div[class*="border-2"]');
      await user.click(template!);
      await user.click(screen.getByText('Continue to Compose'));
    });

    it('should display selected template info', () => {
      expect(screen.getByText('Initial Review Request')).toBeInTheDocument();
      expect(screen.getByText('Initial review request template')).toBeInTheDocument();
    });

    it('should allow editing message content', async () => {
      const user = userEvent.setup();

      const messageTextarea = screen.getByPlaceholderText(/Enter your sms message.../i);
      expect(messageTextarea).toHaveValue('Hi {{firstName}}, please review us at {{reviewUrl}}');

      await user.clear(messageTextarea);
      await user.type(messageTextarea, 'New custom message');

      expect(messageTextarea).toHaveValue('New custom message');
    });

    it('should show character count for messages', () => {
      expect(screen.getByText(/50 characters/i)).toBeInTheDocument();
    });

    it('should toggle between edit and preview tabs', async () => {
      const user = userEvent.setup();

      const previewTab = screen.getByRole('button', { name: /Preview/i });
      await user.click(previewTab);

      expect(screen.getByText('How John Doe will see this message:')).toBeInTheDocument();
      expect(
        screen.getByText('Hi John, please review us at https://g.page/your-business/review')
      ).toBeInTheDocument();
    });

    it('should show personalization variables accordion', async () => {
      const user = userEvent.setup();

      const addVariablesButton = screen.getByText('Add Variables');
      await user.click(addVariablesButton);

      expect(screen.getByText('Personalization')).toBeInTheDocument();
      expect(screen.getByText('Customer Information')).toBeInTheDocument();
    });

    it('should insert variables when clicked', async () => {
      const user = userEvent.setup();

      const messageTextarea = screen.getByPlaceholderText(/Enter your sms message.../i);
      await user.clear(messageTextarea);

      const addVariablesButton = screen.getByText('Add Variables');
      await user.click(addVariablesButton);

      // Find and click the firstName variable
      const variableButton = screen.getByText('First Name').closest('button');
      await user.click(variableButton!);

      expect(messageTextarea).toHaveValue('{{firstName}}');
    });

    it('should proceed to schedule step when continue is clicked', async () => {
      const user = userEvent.setup();

      const continueButton = screen.getByText('Continue to Schedule & Send');
      await user.click(continueButton);

      expect(screen.getByText('Schedule & Send')).toBeInTheDocument();
    });
  });

  describe('Schedule & Send (Step 3)', () => {
    beforeEach(async () => {
      const user = userEvent.setup();
      render(<CreateReviewRequestModal {...defaultProps} />);

      // Navigate to schedule step
      const template = screen.getByText('Initial Review Request').closest('div[class*="border-2"]');
      await user.click(template!);
      await user.click(screen.getByText('Continue to Compose'));
      await user.click(screen.getByText('Continue to Schedule & Send'));
    });

    it('should display scheduling options', () => {
      expect(screen.getByText('Send Timing')).toBeInTheDocument();
      expect(screen.getByText('Send Now')).toBeInTheDocument();
      expect(screen.getByText('Schedule')).toBeInTheDocument();
    });

    it('should default to send immediately', () => {
      const sendNowButton = screen.getByText('Send Now').closest('button');
      expect(sendNowButton).toHaveClass('border-blue-500');
    });

    it('should switch to scheduled mode when clicked', async () => {
      const user = userEvent.setup();

      const scheduleButton = screen.getByText('Schedule').closest('button');
      await user.click(scheduleButton!);

      expect(scheduleButton).toHaveClass('border-blue-500');
      expect(screen.getByLabelText('Date')).toBeInTheDocument();
      expect(screen.getByLabelText('Time')).toBeInTheDocument();
    });

    it('should validate scheduled date/time', async () => {
      const user = userEvent.setup();

      const scheduleButton = screen.getByText('Schedule').closest('button');
      await user.click(scheduleButton!);

      // Set a past date
      const dateInput = screen.getByLabelText('Date');
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await user.type(dateInput, yesterday.toISOString().split('T')[0]);

      await waitFor(() => {
        expect(screen.getByText('Scheduled time must be in the future')).toBeInTheDocument();
      });
    });

    it('should show review request summary', () => {
      expect(screen.getByText('Review Request Information')).toBeInTheDocument();
      expect(screen.getByText('SMS')).toBeInTheDocument();
      expect(screen.getByText('1 customer')).toBeInTheDocument();
    });

    it('should send review request when Send Now is clicked', async () => {
      const user = userEvent.setup();

      const sendButton = screen.getByRole('button', { name: /Send Now/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(reviewRequestService.createReviewRequests).toHaveBeenCalledWith(
          [mockCustomer],
          expect.objectContaining({ id: 'template-1' }),
          expect.any(String),
          expect.any(String),
          undefined
        );
      });
    });

    it('should schedule review request with selected date/time', async () => {
      const user = userEvent.setup();

      // Switch to schedule mode
      const scheduleButton = screen.getByText('Schedule').closest('button');
      await user.click(scheduleButton!);

      // Set future date/time
      const dateInput = screen.getByLabelText('Date');
      const timeInput = screen.getByLabelText('Time');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await user.type(dateInput, tomorrow.toISOString().split('T')[0]);
      await user.type(timeInput, '14:30');

      const sendButton = screen.getByRole('button', { name: /Schedule/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(reviewRequestService.createReviewRequests).toHaveBeenCalledWith(
          [mockCustomer],
          expect.objectContaining({ id: 'template-1' }),
          expect.any(String),
          expect.any(String),
          expect.any(Date)
        );
      });
    });

    it('should display success message after sending', async () => {
      const user = userEvent.setup();

      const sendButton = screen.getByRole('button', { name: /Send Now/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('Review Requests Sent Successfully!')).toBeInTheDocument();
        expect(screen.getByText('1 of 1 requests sent successfully')).toBeInTheDocument();
      });
    });

    it('should display error message on failure', async () => {
      const user = userEvent.setup();

      (reviewRequestService.createReviewRequests as jest.Mock).mockResolvedValue({
        requests: [],
        totalRequests: 1,
        successfulRequests: 0,
        failedRequests: 1,
        errors: ['Failed to send: Network error'],
      });

      const sendButton = screen.getByRole('button', { name: /Send Now/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('Review Request Failed')).toBeInTheDocument();
        expect(screen.getByText('0 of 1 requests sent successfully')).toBeInTheDocument();
        expect(screen.getByText('Failed to send: Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate between steps using back button', async () => {
      const user = userEvent.setup();
      render(<CreateReviewRequestModal {...defaultProps} />);

      // Go to step 2
      const template = screen.getByText('Initial Review Request').closest('div[class*="border-2"]');
      await user.click(template!);
      await user.click(screen.getByText('Continue to Compose'));

      // Verify on step 2
      expect(screen.getByText('Compose Message')).toBeInTheDocument();

      // Go back to step 1
      const backButton = screen.getByRole('button', { name: /Back/i });
      await user.click(backButton);

      expect(screen.getByText('Choose Template')).toBeInTheDocument();
    });

    it('should close modal when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<CreateReviewRequestModal {...defaultProps} />);

      const cancelButton = screen.getByText('Cancel');
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should close modal automatically after successful send', async () => {
      const user = userEvent.setup();
      render(<CreateReviewRequestModal {...defaultProps} />);

      // Navigate to send step
      const template = screen.getByText('Initial Review Request').closest('div[class*="border-2"]');
      await user.click(template!);
      await user.click(screen.getByText('Continue to Compose'));
      await user.click(screen.getByText('Continue to Schedule & Send'));

      const sendButton = screen.getByRole('button', { name: /Send Now/i });
      await user.click(sendButton);

      // Wait for auto-close after 3 seconds
      await waitFor(
        () => {
          expect(mockOnClose).toHaveBeenCalled();
        },
        { timeout: 4000 }
      );
    });
  });

  describe('Bulk Operations', () => {
    it('should handle bulk customer selection', async () => {
      const user = userEvent.setup();
      const selectedCustomerIds = new Set(['customer-1', 'customer-2']);

      render(
        <CreateReviewRequestModal
          {...defaultProps}
          customer={null}
          customers={mockCustomers}
          selectedCustomerIds={selectedCustomerIds}
        />
      );

      // Navigate to send step
      const template = screen.getByText('Initial Review Request').closest('div[class*="border-2"]');
      await user.click(template!);
      await user.click(screen.getByText('Continue to Compose'));
      await user.click(screen.getByText('Continue to Schedule & Send'));

      expect(screen.getByText('2 customers')).toBeInTheDocument();

      const sendButton = screen.getByRole('button', { name: /Send Now/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(reviewRequestService.createReviewRequests).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ id: 'customer-1' }),
            expect.objectContaining({ id: 'customer-2' }),
          ]),
          expect.any(Object),
          expect.any(String),
          expect.any(String),
          undefined
        );
      });
    });
  });

  describe('Email Template Handling', () => {
    beforeEach(async () => {
      const user = userEvent.setup();
      render(<CreateReviewRequestModal {...defaultProps} />);

      // Select email template
      const template = screen.getByText('Email Review Request').closest('div[class*="border-2"]');
      await user.click(template!);
      await user.click(screen.getByText('Continue to Compose'));
    });

    it('should show subject line input for email templates', () => {
      expect(screen.getByLabelText('Subject Line')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Review Request from {{businessName}}')).toBeInTheDocument();
    });

    it('should allow editing email subject', async () => {
      const user = userEvent.setup();

      const subjectInput = screen.getByLabelText('Subject Line');
      await user.clear(subjectInput);
      await user.type(subjectInput, 'New Email Subject');

      expect(subjectInput).toHaveValue('New Email Subject');
    });

    it('should show subject in preview mode', async () => {
      const user = userEvent.setup();

      const previewTab = screen.getByRole('button', { name: /Preview/i });
      await user.click(previewTab);

      expect(screen.getByText('Subject:')).toBeInTheDocument();
      expect(screen.getByText(/Review Request from/)).toBeInTheDocument();
    });
  });
});
