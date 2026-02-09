'use client';

import React, { useState, useMemo, useCallback } from 'react';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  key: string;
  direction: SortDirection;
}

interface Column<T> {
  /** Unique key - also used to access row data when accessor is not provided */
  key: string;
  /** Column header label */
  header: string;
  /** Optional accessor function to get the cell value from the row */
  accessor?: (row: T) => React.ReactNode;
  /** Whether this column is sortable */
  sortable?: boolean;
  /** Custom sort comparator: return negative, zero, or positive */
  sortFn?: (a: T, b: T) => number;
  /** Column width (Tailwind class, e.g. "w-48") */
  width?: string;
  /** Align cell content */
  align?: 'left' | 'center' | 'right';
  /** Whether to hide on smaller screens */
  hideOnMobile?: boolean;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Unique key extractor for each row */
  rowKey: (row: T, index: number) => string | number;
  /** Controlled sort state */
  sort?: SortState;
  onSort?: (sort: SortState) => void;
  /** Enable client-side sorting when onSort is not provided */
  clientSort?: boolean;
  /** Pagination */
  page?: number;
  pageSize?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
  /** Empty state */
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  emptyMessage?: string;
  /** Loading */
  loading?: boolean;
  /** Row click handler */
  onRowClick?: (row: T) => void;
  /** Striped rows */
  striped?: boolean;
  /** Compact density */
  compact?: boolean;
  className?: string;
}

/* -------------------------------------------------------------------------- */
/*  Sort icon                                                                  */
/* -------------------------------------------------------------------------- */

const SortIcon: React.FC<{ direction: SortDirection }> = ({ direction }) => (
  <span className="inline-flex ml-1">
    {direction === null && (
      <svg className="w-4 h-4 text-gray-300" viewBox="0 0 20 20" fill="currentColor">
        <path d="M7 8l3-3 3 3H7zM7 12l3 3 3-3H7z" />
      </svg>
    )}
    {direction === 'asc' && (
      <svg className="w-4 h-4 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
        <path d="M7 12l3-3 3 3H7z" />
      </svg>
    )}
    {direction === 'desc' && (
      <svg className="w-4 h-4 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
        <path d="M7 8l3 3 3-3H7z" />
      </svg>
    )}
  </span>
);

/* -------------------------------------------------------------------------- */
/*  Table component                                                            */
/* -------------------------------------------------------------------------- */

function Table<T>({
  columns,
  data,
  rowKey,
  sort: controlledSort,
  onSort,
  clientSort = false,
  page = 1,
  pageSize = 10,
  totalCount,
  onPageChange,
  emptyIcon,
  emptyTitle = 'No data found',
  emptyMessage = 'There are no records to display.',
  loading = false,
  onRowClick,
  striped = false,
  compact = false,
  className = '',
}: TableProps<T>) {
  /* --- Internal sort state for client-side sorting --- */
  const [internalSort, setInternalSort] = useState<SortState>({ key: '', direction: null });
  const activeSort = controlledSort ?? internalSort;

  const handleSort = useCallback(
    (key: string) => {
      let direction: SortDirection = 'asc';
      if (activeSort.key === key) {
        if (activeSort.direction === 'asc') direction = 'desc';
        else if (activeSort.direction === 'desc') direction = null;
      }
      const next = { key, direction };
      if (onSort) {
        onSort(next);
      } else {
        setInternalSort(next);
      }
    },
    [activeSort, onSort]
  );

  /* --- Sorted data (client-side only when no onSort handler) --- */
  const sortedData = useMemo(() => {
    if (!clientSort || onSort || !activeSort.direction || !activeSort.key) return data;

    const col = columns.find((c) => c.key === activeSort.key);
    if (!col) return data;

    return [...data].sort((a, b) => {
      if (col.sortFn) {
        return activeSort.direction === 'asc' ? col.sortFn(a, b) : col.sortFn(b, a);
      }
      const aVal = col.accessor ? col.accessor(a) : (a as Record<string, unknown>)[col.key];
      const bVal = col.accessor ? col.accessor(b) : (b as Record<string, unknown>)[col.key];
      const aStr = String(aVal ?? '');
      const bStr = String(bVal ?? '');
      const cmp = aStr.localeCompare(bStr, undefined, { numeric: true });
      return activeSort.direction === 'asc' ? cmp : -cmp;
    });
  }, [data, activeSort, clientSort, columns, onSort]);

  /* --- Pagination math --- */
  const total = totalCount ?? data.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, total);

  const cellPadding = compact ? 'px-4 py-2' : 'px-6 py-3';
  const headerPadding = compact ? 'px-4 py-2' : 'px-6 py-3';

  const alignClass = (align?: string) => {
    if (align === 'center') return 'text-center';
    if (align === 'right') return 'text-right';
    return 'text-left';
  };

  /* --- Loading skeleton --- */
  if (loading) {
    return (
      <div className={`bg-white border border-gray-200 rounded-lg overflow-hidden ${className}`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`${headerPadding} text-xs font-medium text-gray-500 uppercase tracking-wider ${alignClass(col.align)} ${col.width ?? ''}`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col.key} className={cellPadding}>
                      <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* --- Empty state --- */
  if (sortedData.length === 0) {
    return (
      <div className={`bg-white border border-gray-200 rounded-lg overflow-hidden ${className}`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`${headerPadding} text-xs font-medium text-gray-500 uppercase tracking-wider ${alignClass(col.align)} ${col.width ?? ''}`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
        <div className="flex flex-col items-center justify-center py-16 px-4">
          {emptyIcon && <div className="mb-4 text-gray-300">{emptyIcon}</div>}
          {!emptyIcon && (
            <svg
              className="w-12 h-12 text-gray-300 mb-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 11.625l2.25-2.25M12 11.625l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
              />
            </svg>
          )}
          <p className="text-sm font-medium text-gray-900">{emptyTitle}</p>
          <p className="text-sm text-gray-500 mt-1">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  /* --- Main table --- */
  return (
    <div className={`bg-white border border-gray-200 rounded-lg overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => {
                const isSorted = activeSort.key === col.key;
                return (
                  <th
                    key={col.key}
                    className={[
                      headerPadding,
                      'text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap',
                      alignClass(col.align),
                      col.width ?? '',
                      col.sortable ? 'cursor-pointer select-none hover:text-gray-700' : '',
                      col.hideOnMobile ? 'hidden md:table-cell' : '',
                    ].join(' ')}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                    aria-sort={
                      isSorted && activeSort.direction === 'asc'
                        ? 'ascending'
                        : isSorted && activeSort.direction === 'desc'
                          ? 'descending'
                          : undefined
                    }
                  >
                    <span className="inline-flex items-center">
                      {col.header}
                      {col.sortable && (
                        <SortIcon direction={isSorted ? activeSort.direction : null} />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {sortedData.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                className={[
                  onRowClick ? 'cursor-pointer hover:bg-blue-50' : 'hover:bg-gray-50',
                  striped && index % 2 !== 0 ? 'bg-gray-50/50' : '',
                  'transition-colors',
                ].join(' ')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => {
                  const cellValue = col.accessor
                    ? col.accessor(row)
                    : (row as Record<string, unknown>)[col.key];
                  return (
                    <td
                      key={col.key}
                      className={[
                        cellPadding,
                        'text-sm text-gray-700 whitespace-nowrap',
                        alignClass(col.align),
                        col.hideOnMobile ? 'hidden md:table-cell' : '',
                      ].join(' ')}
                    >
                      {cellValue as React.ReactNode}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {onPageChange && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
          <p className="text-sm text-gray-500">
            Showing <span className="font-medium">{startIndex}</span> to{' '}
            <span className="font-medium">{endIndex}</span> of{' '}
            <span className="font-medium">{total}</span> results
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>

            {/* Page numbers */}
            {generatePageNumbers(page, totalPages).map((p, i) =>
              p === '...' ? (
                <span key={`ellipsis-${i}`} className="px-2 text-gray-400 text-sm">
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPageChange(p as number)}
                  className={[
                    'px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors',
                    p === page
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'text-gray-600 bg-white border-gray-300 hover:bg-gray-50',
                  ].join(' ')}
                >
                  {p}
                </button>
              )
            )}

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function generatePageNumbers(
  current: number,
  total: number
): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | '...')[] = [];

  if (current <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i);
    pages.push('...');
    pages.push(total);
  } else if (current >= total - 3) {
    pages.push(1);
    pages.push('...');
    for (let i = total - 4; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    pages.push('...');
    pages.push(current - 1);
    pages.push(current);
    pages.push(current + 1);
    pages.push('...');
    pages.push(total);
  }

  return pages;
}

export { Table, type Column, type SortState, type SortDirection, type TableProps };
export default Table;
