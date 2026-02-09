'use client';

import React, { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface DropdownItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
  /** If provided, renders a link instead of a button */
  href?: string;
}

interface DropdownDivider {
  key: string;
  type: 'divider';
}

interface DropdownHeader {
  key: string;
  type: 'header';
  label: string;
}

type DropdownEntry = DropdownItem | DropdownDivider | DropdownHeader;

type DropdownPlacement =
  | 'bottom-start'
  | 'bottom-end'
  | 'top-start'
  | 'top-end';

interface DropdownProps {
  trigger: ReactNode;
  items: DropdownEntry[];
  placement?: DropdownPlacement;
  width?: string;
  className?: string;
}

/* -------------------------------------------------------------------------- */
/*  Placement classes                                                           */
/* -------------------------------------------------------------------------- */

const placementClasses: Record<DropdownPlacement, string> = {
  'bottom-start': 'top-full left-0 mt-1',
  'bottom-end': 'top-full right-0 mt-1',
  'top-start': 'bottom-full left-0 mb-1',
  'top-end': 'bottom-full right-0 mb-1',
};

/* -------------------------------------------------------------------------- */
/*  Type guards                                                                */
/* -------------------------------------------------------------------------- */

function isDivider(entry: DropdownEntry): entry is DropdownDivider {
  return 'type' in entry && entry.type === 'divider';
}

function isHeader(entry: DropdownEntry): entry is DropdownHeader {
  return 'type' in entry && entry.type === 'header';
}

/* -------------------------------------------------------------------------- */
/*  Dropdown component                                                         */
/* -------------------------------------------------------------------------- */

const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  items,
  placement = 'bottom-end',
  width = 'w-48',
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /* --- Close on outside click --- */
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  /* --- Close on Escape --- */
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  /* --- Keyboard navigation --- */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen(true);
          return;
        }
      }

      if (!menuRef.current) return;

      const focusable = Array.from(
        menuRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a:not([disabled])'
        )
      );

      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = currentIndex < focusable.length - 1 ? currentIndex + 1 : 0;
        focusable[next]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = currentIndex > 0 ? currentIndex - 1 : focusable.length - 1;
        focusable[prev]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        focusable[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        focusable[focusable.length - 1]?.focus();
      }
    },
    [open]
  );

  /* --- Focus first item when menu opens --- */
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const first = menuRef.current.querySelector<HTMLElement>(
      'button:not([disabled]), a:not([disabled])'
    );
    first?.focus();
  }, [open]);

  return (
    <div
      ref={containerRef}
      className={`relative inline-block ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger */}
      <div
        onClick={() => setOpen((prev) => !prev)}
        role="button"
        tabIndex={0}
        aria-haspopup="true"
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
      >
        {trigger}
      </div>

      {/* Menu */}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={[
            'absolute z-50 py-1 bg-white rounded-lg border border-gray-200 shadow-lg',
            'focus:outline-none',
            placementClasses[placement],
            width,
          ].join(' ')}
        >
          {items.map((entry) => {
            if (isDivider(entry)) {
              return (
                <div
                  key={entry.key}
                  className="my-1 border-t border-gray-100"
                  role="separator"
                />
              );
            }

            if (isHeader(entry)) {
              return (
                <div
                  key={entry.key}
                  className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                >
                  {entry.label}
                </div>
              );
            }

            const item = entry as DropdownItem;
            const isDanger = item.variant === 'danger';

            const itemClasses = [
              'flex items-center gap-2 w-full text-left px-3 py-2 text-sm',
              'transition-colors focus:outline-none',
              item.disabled
                ? 'text-gray-300 cursor-not-allowed'
                : isDanger
                  ? 'text-red-600 hover:bg-red-50 focus:bg-red-50'
                  : 'text-gray-700 hover:bg-gray-50 focus:bg-gray-50',
            ].join(' ');

            const handleItemClick = () => {
              if (item.disabled) return;
              item.onClick?.();
              setOpen(false);
            };

            if (item.href && !item.disabled) {
              return (
                <a
                  key={item.key}
                  href={item.href}
                  role="menuitem"
                  className={itemClasses}
                  onClick={() => setOpen(false)}
                >
                  {item.icon && <span className="shrink-0 w-4 h-4">{item.icon}</span>}
                  <span>{item.label}</span>
                </a>
              );
            }

            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={itemClasses}
                onClick={handleItemClick}
              >
                {item.icon && <span className="shrink-0 w-4 h-4">{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

Dropdown.displayName = 'Dropdown';

/* -------------------------------------------------------------------------- */
/*  ActionMenu - convenience wrapper for common row-action patterns            */
/* -------------------------------------------------------------------------- */

interface ActionMenuProps {
  items: DropdownEntry[];
  placement?: DropdownPlacement;
  className?: string;
}

const ActionMenu: React.FC<ActionMenuProps> = ({
  items,
  placement = 'bottom-end',
  className = '',
}) => (
  <Dropdown
    placement={placement}
    items={items}
    className={className}
    trigger={
      <button
        type="button"
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        aria-label="Actions"
      >
        <svg
          className="w-5 h-5"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
        </svg>
      </button>
    }
  />
);

ActionMenu.displayName = 'ActionMenu';

/* -------------------------------------------------------------------------- */
/*  Exports                                                                    */
/* -------------------------------------------------------------------------- */

export {
  Dropdown,
  ActionMenu,
  type DropdownProps,
  type DropdownItem,
  type DropdownDivider,
  type DropdownHeader,
  type DropdownEntry,
  type DropdownPlacement,
  type ActionMenuProps,
};
export default Dropdown;
