'use client';

import React, { useState, useEffect, useCallback, type ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

type AlertVariant = 'success' | 'error' | 'warning' | 'info';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/* -------------------------------------------------------------------------- */
/*  Style maps                                                                 */
/* -------------------------------------------------------------------------- */

const variantClasses: Record<AlertVariant, string> = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
};

const iconColorClasses: Record<AlertVariant, string> = {
  success: 'text-green-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
};

/* -------------------------------------------------------------------------- */
/*  Default icons                                                              */
/* -------------------------------------------------------------------------- */

const DefaultIcons: Record<AlertVariant, React.FC<{ className?: string }>> = {
  success: ({ className }) => (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </svg>
  ),
  error: ({ className }) => (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
        clipRule="evenodd"
      />
    </svg>
  ),
  warning: ({ className }) => (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  ),
  info: ({ className }) => (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
        clipRule="evenodd"
      />
    </svg>
  ),
};

/* -------------------------------------------------------------------------- */
/*  Alert component                                                            */
/* -------------------------------------------------------------------------- */

const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  title,
  children,
  dismissible = false,
  onDismiss,
  icon,
  action,
  className = '',
}) => {
  const [visible, setVisible] = useState(true);

  const handleDismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  if (!visible) return null;

  const IconComponent = DefaultIcons[variant];

  return (
    <div
      role="alert"
      className={[
        'flex gap-3 rounded-lg border p-4',
        variantClasses[variant],
        className,
      ].join(' ')}
    >
      {/* Icon */}
      <div className="shrink-0 mt-0.5">
        {icon || <IconComponent className={`w-5 h-5 ${iconColorClasses[variant]}`} />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-semibold">{title}</p>}
        <div className={`text-sm ${title ? 'mt-1' : ''}`}>{children}</div>
        {action && <div className="mt-3">{action}</div>}
      </div>

      {/* Dismiss button */}
      {dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 -mt-1 -mr-1 p-1 rounded-lg opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </div>
  );
};

Alert.displayName = 'Alert';

/* -------------------------------------------------------------------------- */
/*  Toast notification (ephemeral alert)                                       */
/* -------------------------------------------------------------------------- */

interface ToastProps {
  variant?: AlertVariant;
  message: string;
  duration?: number;
  onClose: () => void;
  className?: string;
}

const Toast: React.FC<ToastProps> = ({
  variant = 'info',
  message,
  duration = 5000,
  onClose,
  className = '',
}) => {
  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const IconComponent = DefaultIcons[variant];

  return (
    <div
      role="status"
      className={[
        'flex items-center gap-3 rounded-lg border p-4 shadow-lg bg-white min-w-[320px] max-w-md',
        'border-gray-200',
        className,
      ].join(' ')}
    >
      <IconComponent className={`w-5 h-5 shrink-0 ${iconColorClasses[variant]}`} />
      <p className="flex-1 text-sm text-gray-700">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
        aria-label="Close"
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
};

Toast.displayName = 'Toast';

/* -------------------------------------------------------------------------- */
/*  AlertModal - appears on login showing deadline alerts                      */
/* -------------------------------------------------------------------------- */

interface DeadlineAlert {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  severity: 'warning' | 'error' | 'info';
}

interface AlertModalProps {
  open: boolean;
  onClose: () => void;
  alerts: DeadlineAlert[];
  title?: string;
  className?: string;
}

const severityConfig: Record<
  DeadlineAlert['severity'],
  { bg: string; border: string; icon: string; dot: string }
> = {
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-red-500',
    dot: 'bg-red-500',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-500',
    dot: 'bg-amber-500',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: 'text-blue-500',
    dot: 'bg-blue-500',
  },
};

const AlertModal: React.FC<AlertModalProps> = ({
  open,
  onClose,
  alerts,
  title = 'Upcoming Deadlines',
  className = '',
}) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [open, handleKeyDown]);

  if (!open || alerts.length === 0) return null;

  const errorCount = alerts.filter((a) => a.severity === 'error').length;
  const warningCount = alerts.filter((a) => a.severity === 'warning').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-modal-title"
        className={[
          'relative z-10 w-full max-w-lg mx-4 bg-white rounded-xl shadow-xl',
          'flex flex-col max-h-[85vh]',
          className,
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-amber-500"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              <h2
                id="alert-modal-title"
                className="text-lg font-semibold text-gray-900"
              >
                {title}
              </h2>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              You have{' '}
              {errorCount > 0 && (
                <span className="font-medium text-red-600">
                  {errorCount} overdue
                </span>
              )}
              {errorCount > 0 && warningCount > 0 && ' and '}
              {warningCount > 0 && (
                <span className="font-medium text-amber-600">
                  {warningCount} upcoming
                </span>
              )}
              {errorCount === 0 && warningCount === 0 && (
                <span className="font-medium">{alerts.length}</span>
              )}{' '}
              deadline{alerts.length !== 1 ? 's' : ''} that need
              {alerts.length === 1 ? 's' : ''} attention.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 -mt-1 -mr-1 p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Alert list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {alerts.map((alert) => {
            const config = severityConfig[alert.severity];
            return (
              <div
                key={alert.id}
                className={`flex gap-3 rounded-lg border p-3 ${config.bg} ${config.border}`}
              >
                <span
                  className={`shrink-0 mt-1.5 w-2 h-2 rounded-full ${config.dot}`}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{alert.description}</p>
                  <p className={`text-xs font-medium mt-1 ${config.icon}`}>
                    Due: {alert.dueDate}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
};

AlertModal.displayName = 'AlertModal';

/* -------------------------------------------------------------------------- */
/*  Exports                                                                    */
/* -------------------------------------------------------------------------- */

export {
  Alert,
  Toast,
  AlertModal,
  type AlertProps,
  type AlertVariant,
  type ToastProps,
  type AlertModalProps,
  type DeadlineAlert,
};
export default Alert;
