import React, { type ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/*  Card                                                                       */
/* -------------------------------------------------------------------------- */

interface CardProps {
  children: ReactNode;
  padding?: boolean;
  hover?: boolean;
  className?: string;
}

const Card: React.FC<CardProps> = ({
  children,
  padding = true,
  hover = false,
  className = '',
}) => (
  <div
    className={[
      'bg-white border border-gray-200 rounded-lg shadow-sm',
      hover ? 'hover:shadow-md transition-shadow duration-200' : '',
      padding ? 'p-6' : '',
      className,
    ].join(' ')}
  >
    {children}
  </div>
);

Card.displayName = 'Card';

/* -------------------------------------------------------------------------- */
/*  CardHeader                                                                 */
/* -------------------------------------------------------------------------- */

interface CardHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  description,
  action,
  className = '',
}) => (
  <div className={`flex items-start justify-between ${className}`}>
    <div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      )}
    </div>
    {action && <div className="ml-4 shrink-0">{action}</div>}
  </div>
);

CardHeader.displayName = 'CardHeader';

/* -------------------------------------------------------------------------- */
/*  CardBody                                                                   */
/* -------------------------------------------------------------------------- */

interface CardBodyProps {
  children: ReactNode;
  className?: string;
}

const CardBody: React.FC<CardBodyProps> = ({ children, className = '' }) => (
  <div className={`mt-4 ${className}`}>{children}</div>
);

CardBody.displayName = 'CardBody';

/* -------------------------------------------------------------------------- */
/*  CardFooter                                                                 */
/* -------------------------------------------------------------------------- */

interface CardFooterProps {
  children: ReactNode;
  align?: 'left' | 'center' | 'right' | 'between';
  className?: string;
}

const alignClasses = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
  between: 'justify-between',
};

const CardFooter: React.FC<CardFooterProps> = ({
  children,
  align = 'right',
  className = '',
}) => (
  <div
    className={[
      'flex items-center gap-3 mt-6 pt-4 border-t border-gray-200',
      alignClasses[align],
      className,
    ].join(' ')}
  >
    {children}
  </div>
);

CardFooter.displayName = 'CardFooter';

/* -------------------------------------------------------------------------- */
/*  Stat Card (convenience wrapper)                                            */
/* -------------------------------------------------------------------------- */

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: ReactNode;
  className?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  changeType = 'neutral',
  icon,
  className = '',
}) => {
  const changeColor =
    changeType === 'positive'
      ? 'text-green-600'
      : changeType === 'negative'
        ? 'text-red-600'
        : 'text-gray-500';

  return (
    <Card className={className}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {change && (
            <p className={`mt-1 text-sm font-medium ${changeColor}`}>
              {changeType === 'positive' && (
                <svg className="inline w-4 h-4 mr-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
                </svg>
              )}
              {changeType === 'negative' && (
                <svg className="inline w-4 h-4 mr-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
                </svg>
              )}
              {change}
            </p>
          )}
        </div>
        {icon && (
          <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
};

StatCard.displayName = 'StatCard';

/* -------------------------------------------------------------------------- */
/*  Exports                                                                    */
/* -------------------------------------------------------------------------- */

export {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  StatCard,
  type CardProps,
  type CardHeaderProps,
  type CardBodyProps,
  type CardFooterProps,
  type StatCardProps,
};
export default Card;
