import React from 'react';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

type BadgeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'gray';

type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  removable?: boolean;
  onRemove?: () => void;
  children: React.ReactNode;
  className?: string;
}

/* -------------------------------------------------------------------------- */
/*  Style maps                                                                 */
/* -------------------------------------------------------------------------- */

const variantClasses: Record<BadgeVariant, string> = {
  default:
    'bg-gray-100 text-gray-700 border-gray-200',
  primary:
    'bg-blue-50 text-blue-700 border-blue-200',
  success:
    'bg-green-50 text-green-700 border-green-200',
  warning:
    'bg-amber-50 text-amber-700 border-amber-200',
  danger:
    'bg-red-50 text-red-700 border-red-200',
  info:
    'bg-sky-50 text-sky-700 border-sky-200',
  gray:
    'bg-gray-50 text-gray-600 border-gray-200',
};

const dotColorClasses: Record<BadgeVariant, string> = {
  default: 'bg-gray-500',
  primary: 'bg-blue-500',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-sky-500',
  gray: 'bg-gray-400',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
};

/* -------------------------------------------------------------------------- */
/*  Badge component                                                            */
/* -------------------------------------------------------------------------- */

const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  dot = false,
  removable = false,
  onRemove,
  children,
  className = '',
}) => (
  <span
    className={[
      'inline-flex items-center font-medium rounded-full border',
      variantClasses[variant],
      sizeClasses[size],
      className,
    ].join(' ')}
  >
    {dot && (
      <span
        className={`shrink-0 w-1.5 h-1.5 rounded-full mr-1.5 ${dotColorClasses[variant]}`}
        aria-hidden="true"
      />
    )}
    {children}
    {removable && (
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 -mr-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-black/10 transition-colors"
        aria-label="Remove"
      >
        <svg
          className="w-3 h-3"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    )}
  </span>
);

Badge.displayName = 'Badge';

/* -------------------------------------------------------------------------- */
/*  Status Badge (convenience wrapper for common statuses)                     */
/* -------------------------------------------------------------------------- */

type StatusType =
  | 'active'
  | 'inactive'
  | 'pending'
  | 'completed'
  | 'cancelled'
  | 'overdue'
  | 'draft';

const statusMap: Record<StatusType, { variant: BadgeVariant; label: string }> = {
  active: { variant: 'success', label: 'Active' },
  inactive: { variant: 'gray', label: 'Inactive' },
  pending: { variant: 'warning', label: 'Pending' },
  completed: { variant: 'primary', label: 'Completed' },
  cancelled: { variant: 'danger', label: 'Cancelled' },
  overdue: { variant: 'danger', label: 'Overdue' },
  draft: { variant: 'default', label: 'Draft' },
};

interface StatusBadgeProps {
  status: StatusType;
  size?: BadgeSize;
  className?: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md', className = '' }) => {
  const config = statusMap[status];
  return (
    <Badge variant={config.variant} size={size} dot className={className}>
      {config.label}
    </Badge>
  );
};

StatusBadge.displayName = 'StatusBadge';

export {
  Badge,
  StatusBadge,
  type BadgeProps,
  type BadgeVariant,
  type BadgeSize,
  type StatusBadgeProps,
  type StatusType,
};
export default Badge;
