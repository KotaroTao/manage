'use client';

import React, { useState, useRef, useEffect, useCallback, forwardRef } from 'react';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface FilterOption {
  label: string;
  value: string;
}

interface FilterDropdown {
  key: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}

interface SearchInputProps {
  /** Current search value (controlled) */
  value?: string;
  /** Called with the debounced search value */
  onSearch: (value: string) => void;
  /** Debounce delay in ms (default 300) */
  debounce?: number;
  /** Placeholder text */
  placeholder?: string;
  /** Optional filter dropdowns rendered alongside the search */
  filters?: FilterDropdown[];
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Loading indicator */
  loading?: boolean;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  className?: string;
}

/* -------------------------------------------------------------------------- */
/*  Size classes                                                               */
/* -------------------------------------------------------------------------- */

const sizeClasses = {
  sm: 'h-8 text-sm pl-9 pr-8',
  md: 'h-10 text-sm pl-10 pr-9',
  lg: 'h-12 text-base pl-11 pr-10',
};

const iconSizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

const iconLeftClasses = {
  sm: 'left-2.5',
  md: 'left-3',
  lg: 'left-3.5',
};

const clearButtonClasses = {
  sm: 'right-2',
  md: 'right-2.5',
  lg: 'right-3',
};

/* -------------------------------------------------------------------------- */
/*  Search Input component                                                     */
/* -------------------------------------------------------------------------- */

const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value: controlledValue,
      onSearch,
      debounce = 300,
      placeholder = 'Search...',
      filters,
      size = 'md',
      loading = false,
      autoFocus = false,
      className = '',
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = useState(controlledValue ?? '');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isControlled = controlledValue !== undefined;

    /* Sync if controlled value changes externally */
    useEffect(() => {
      if (isControlled) {
        setInternalValue(controlledValue);
      }
    }, [controlledValue, isControlled]);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInternalValue(val);

        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
          onSearch(val);
        }, debounce);
      },
      [onSearch, debounce]
    );

    const handleClear = useCallback(() => {
      setInternalValue('');
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      onSearch('');
    }, [onSearch]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
          if (internalValue) {
            handleClear();
          } else {
            (e.target as HTMLInputElement).blur();
          }
        }
        if (e.key === 'Enter') {
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
          }
          onSearch(internalValue);
        }
      },
      [internalValue, handleClear, onSearch]
    );

    /* Cleanup on unmount */
    useEffect(() => {
      return () => {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
      };
    }, []);

    const hasFilters = filters && filters.length > 0;

    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {/* Search field */}
        <div className="relative flex-1">
          {/* Search icon */}
          <div
            className={`absolute inset-y-0 ${iconLeftClasses[size]} flex items-center pointer-events-none`}
          >
            {loading ? (
              <svg
                className={`animate-spin text-gray-400 ${iconSizeClasses[size]}`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <svg
                className={`text-gray-400 ${iconSizeClasses[size]}`}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>

          {/* Input */}
          <input
            ref={ref}
            type="search"
            value={internalValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus={autoFocus}
            aria-label={placeholder}
            className={[
              'block w-full rounded-lg border border-gray-300 bg-white',
              'transition-colors duration-150',
              'placeholder:text-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
              '[&::-webkit-search-cancel-button]:hidden',
              sizeClasses[size],
            ].join(' ')}
          />

          {/* Clear button */}
          {internalValue && (
            <button
              type="button"
              onClick={handleClear}
              className={`absolute inset-y-0 ${clearButtonClasses[size]} flex items-center text-gray-400 hover:text-gray-600 transition-colors`}
              aria-label="Clear search"
            >
              <svg
                className={iconSizeClasses[size]}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Filter dropdowns */}
        {hasFilters &&
          filters.map((filter) => (
            <div key={filter.key} className="shrink-0">
              <select
                value={filter.value}
                onChange={(e) => filter.onChange(e.target.value)}
                aria-label={filter.label}
                className={[
                  'rounded-lg border border-gray-300 bg-white text-sm text-gray-700',
                  'transition-colors duration-150',
                  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                  'appearance-none cursor-pointer',
                  size === 'sm'
                    ? 'h-8 px-3 pr-8'
                    : size === 'lg'
                      ? 'h-12 px-4 pr-10'
                      : 'h-10 px-3 pr-9',
                ].join(' ')}
                style={{
                  backgroundImage:
                    'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 20 20\' fill=\'%236b7280\'%3E%3Cpath fill-rule=\'evenodd\' d=\'M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z\' clip-rule=\'evenodd\'/%3E%3C/svg%3E")',
                  backgroundPosition: 'right 0.5rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1.25rem',
                }}
              >
                {filter.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';

export { SearchInput, type SearchInputProps, type FilterDropdown, type FilterOption };
export default SearchInput;
