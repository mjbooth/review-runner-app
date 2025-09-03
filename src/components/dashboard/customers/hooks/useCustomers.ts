import { useState, useEffect, useCallback, useRef } from 'react';
import { addAuthHeaders } from '../../../../lib/auth-headers';
import type { Customer } from '../types';

// Custom hook for debouncing values
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface UseCustomersOptions {
  search?: string;
  page?: number;
  limit?: number;
}

interface CustomersResponse {
  success: boolean;
  data: Customer[];
  meta?: {
    pagination: {
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  };
}

interface UseCustomersReturn {
  customers: Customer[];
  loading: boolean;
  searching: boolean;
  error: string | null;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  refetch: () => Promise<void>;
  createCustomer: (customerData: Partial<Customer>) => Promise<Customer | null>;
  updateCustomer: (customerId: string, customerData: Partial<Customer>) => Promise<Customer | null>;
}

export function useCustomers({
  search = '',
  page = 1,
  limit = 20,
}: UseCustomersOptions = {}): UseCustomersReturn {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    totalCount: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // Debounce search to avoid excessive API calls
  const debouncedSearch = useDebounce(search, 300);

  // Cache for client-side filtering small datasets
  const [allCustomersCache, setAllCustomersCache] = useState<Customer[]>([]);
  const [lastCacheTime, setLastCacheTime] = useState<number>(0);
  const cacheValidityMs = 30000; // 30 seconds

  // Track if we should use client-side filtering
  const shouldUseClientFiltering =
    allCustomersCache.length <= 100 && !debouncedSearch.includes(' ');

  // Client-side filtering function
  const filterCustomersLocally = useCallback((customers: Customer[], searchTerm: string) => {
    if (!searchTerm.trim()) return customers;

    const query = searchTerm.toLowerCase().trim();
    return customers.filter(
      customer =>
        customer.firstName.toLowerCase().includes(query) ||
        customer.lastName.toLowerCase().includes(query) ||
        customer.email.toLowerCase().includes(query) ||
        customer.phone.includes(query) ||
        customer.status.toLowerCase().includes(query) ||
        `${customer.firstName} ${customer.lastName}`.toLowerCase().includes(query)
    );
  }, []);

  // Load all customers for caching (no search, high limit)
  const loadAllCustomers = useCallback(async () => {
    try {
      const response = await fetch(`/api/customers?limit=200`, {
        headers: addAuthHeaders(),
      }); // Get more for caching
      const data: CustomersResponse = await response.json();

      if (response.ok && data.success) {
        setAllCustomersCache(data.data);
        setLastCacheTime(Date.now());
        return data.data;
      }
    } catch (err) {
      console.error('Error loading customers cache:', err);
    }
    return [];
  }, []);

  const fetchCustomers = useCallback(
    async (useSearching = false) => {
      try {
        // Show searching state only for server-side searches
        if (useSearching) {
          setSearching(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const now = Date.now();
        const cacheExpired = now - lastCacheTime > cacheValidityMs;

        // For small datasets with simple search, use client-side filtering
        if (
          shouldUseClientFiltering &&
          debouncedSearch &&
          allCustomersCache.length > 0 &&
          !cacheExpired
        ) {
          const filtered = filterCustomersLocally(allCustomersCache, debouncedSearch);

          // Apply pagination to filtered results
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          const paginatedResults = filtered.slice(startIndex, endIndex);

          setCustomers(paginatedResults);
          setPagination({
            totalCount: filtered.length,
            totalPages: Math.ceil(filtered.length / limit),
            hasNextPage: endIndex < filtered.length,
            hasPrevPage: page > 1,
          });

          return;
        }

        // Load cache if empty or expired
        if (allCustomersCache.length === 0 || cacheExpired) {
          await loadAllCustomers();
        }

        // For server-side search or large datasets
        const params = new URLSearchParams({
          page: page.toString(),
          limit: limit.toString(),
        });

        if (debouncedSearch.trim()) {
          params.set('search', debouncedSearch.trim());
        }

        const response = await fetch(`/api/customers?${params}`, {
          headers: addAuthHeaders(),
        });
        const data: CustomersResponse = await response.json();

        if (!response.ok || !data.success) {
          const errorMessage = !data.success
            ? (data as any).error?.message || 'API error'
            : `Failed to fetch customers (HTTP ${response.status})`;
          throw new Error(errorMessage);
        }

        setCustomers(data.data);
        setPagination({
          totalCount: data.meta?.pagination.totalCount || 0,
          totalPages: data.meta?.pagination.totalPages || 0,
          hasNextPage: data.meta?.pagination.hasNextPage || false,
          hasPrevPage: data.meta?.pagination.hasPrevPage || false,
        });
      } catch (err) {
        console.error('Error fetching customers:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch customers');
        setCustomers([]);
      } finally {
        setLoading(false);
        setSearching(false);
      }
    },
    [
      debouncedSearch,
      page,
      limit,
      shouldUseClientFiltering,
      allCustomersCache,
      lastCacheTime,
      cacheValidityMs,
      loadAllCustomers,
      filterCustomersLocally,
    ]
  );

  const createCustomer = useCallback(
    async (customerData: Partial<Customer>): Promise<Customer | null> => {
      try {
        const response = await fetch('/api/customers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...addAuthHeaders(),
          },
          body: JSON.stringify({
            firstName: customerData.firstName,
            lastName: customerData.lastName,
            email: customerData.email,
            phone: customerData.phone,
            address: '', // TODO: Add address field to forms
            notes: '', // TODO: Add notes field to forms
            tags: [], // TODO: Add tags field to forms
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error?.message || 'Failed to create customer');
        }

        // Refresh the customer list and clear cache
        setAllCustomersCache([]);
        setLastCacheTime(0);
        await fetchCustomers();

        return data.data;
      } catch (err) {
        console.error('Error creating customer:', err);
        setError(err instanceof Error ? err.message : 'Failed to create customer');
        return null;
      }
    },
    []
  );

  const updateCustomer = useCallback(
    async (customerId: string, customerData: Partial<Customer>): Promise<Customer | null> => {
      try {
        // Build update payload with only the fields that should be updated
        const updatePayload: Record<string, any> = {};

        // Only include fields that are defined in the customerData and are valid API fields
        const validFields = ['firstName', 'lastName', 'email', 'phone', 'address', 'notes', 'tags'];

        for (const field of validFields) {
          if (field in customerData) {
            const value = customerData[field as keyof Customer];
            // Include the field even if it's null (to allow clearing)
            if (value !== undefined) {
              updatePayload[field] = value;
            }
          }
        }

        // Prevent empty updates
        if (Object.keys(updatePayload).length === 0) {
          throw new Error('No valid fields provided for update');
        }

        const response = await fetch(`/api/customers/${customerId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...addAuthHeaders(),
          },
          body: JSON.stringify(updatePayload),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          const errorMessage = data.error?.message || 'Failed to update customer';
          throw new Error(errorMessage);
        }

        // Optimistically update local state
        const updatedCustomer = data.data;

        setCustomers(prevCustomers =>
          prevCustomers.map(customer => (customer.id === customerId ? updatedCustomer : customer))
        );

        setAllCustomersCache(prevCache =>
          prevCache.map(customer => (customer.id === customerId ? updatedCustomer : customer))
        );

        return updatedCustomer;
      } catch (err) {
        // Only log actual errors, not user-facing error messages
        setError(err instanceof Error ? err.message : 'Failed to update customer');
        return null;
      }
    },
    []
  );

  // Separate effects for initial load vs search changes
  useEffect(() => {
    fetchCustomers();
  }, [page, limit]);

  useEffect(() => {
    if (debouncedSearch !== search && search) {
      // Show immediate search state for user feedback
      fetchCustomers(true);
    } else if (debouncedSearch !== search) {
      fetchCustomers();
    }
  }, [debouncedSearch]);

  return {
    customers,
    loading,
    searching,
    error,
    totalCount: pagination.totalCount,
    totalPages: pagination.totalPages,
    hasNextPage: pagination.hasNextPage,
    hasPrevPage: pagination.hasPrevPage,
    refetch: () => fetchCustomers(),
    createCustomer,
    updateCustomer,
  };
}
