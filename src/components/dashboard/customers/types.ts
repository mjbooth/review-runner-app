export interface Customer {
  id: string; // UUID
  businessId: string; // Multi-tenant isolation
  firstName: string; // Display in title case
  lastName: string; // Display in title case
  email: string; // Display lowercase
  phone: string; // Stored: 07823337419, Display: 07823 337 419
  address?: string | null; // Optional address field
  notes?: string | null; // Optional notes field
  tags?: string[] | null; // Optional tags array
  dateAdded: string; // ISO string, display human-friendly
  suppressed: 'active' | 'suppressed';
  lastRequest: string | null; // ISO string or null
  status: string; // Dynamic text from existing code
  channel: 'email' | 'sms' | null; // Fixed enum
  actions: string; // Current text from existing code
  isActive: boolean; // Soft delete flag
  createdAt: string; // Audit field
  updatedAt: string; // Audit field
}

export interface CustomerTableColumn {
  key: keyof Customer;
  label: string;
  sortable: boolean;
  className?: string;
  mobileHidden?: boolean;
}

export interface CustomerTableState {
  customers: Customer[];
  loading: boolean;
  error: string | null;
  pagination: {
    cursor: string | null;
    hasNext: boolean;
    total: number;
    pageSize: number;
  };
  sort: {
    column: string | null;
    direction: 'asc' | 'desc' | null;
  };
  searchQuery: string;
  selectedRows: Set<string>;
  viewMode: 'table' | 'cards';
}

export interface CustomerTableProps {
  className?: string;
  customers: Customer[]; // Live customer data from API
  onCustomerSelect?: (customer: Customer) => void;
  onSelectionChange?: (selectedIds: Set<string>) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onCreateCustomer?: (customerData: Partial<Customer>) => Promise<Customer | null>;
  onUpdateCustomer?: (
    customerId: string,
    customerData: Partial<Customer>
  ) => Promise<Customer | null>;
  onOpenCreateModal?: () => void;
  onSendReviewRequest?: (customer: Customer) => void;
  searching?: boolean;
}

export interface CustomerRowProps {
  customer: Customer;
  selected: boolean;
  onSelect: (customerId: string) => void;
  onContextMenu: (event: React.MouseEvent, customer: Customer) => void;
}

export interface StatusTagProps {
  status: 'active' | 'suppressed';
  className?: string;
}
