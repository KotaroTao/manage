'use client';

import React, { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Tab {
  /** Unique key for the tab */
  key: string;
  /** Display label */
  label: string;
  /** Optional icon */
  icon?: ReactNode;
  /** Optional badge count */
  count?: number;
  /** Disable this tab */
  disabled?: boolean;
}

interface TabsProps {
  tabs: Tab[];
  /** Currently active tab key */
  activeTab: string;
  /** Tab change handler */
  onTabChange: (key: string) => void;
  /** Visual variant */
  variant?: 'underline' | 'pills' | 'bordered';
  /** Full width tabs */
  fullWidth?: boolean;
  /** Size */
  size?: 'sm' | 'md';
  className?: string;
}

interface TabPanelProps {
  active: boolean;
  children: ReactNode;
  className?: string;
}

/* -------------------------------------------------------------------------- */
/*  TabPanel                                                                   */
/* -------------------------------------------------------------------------- */

const TabPanel: React.FC<TabPanelProps> = ({ active, children, className = '' }) => {
  if (!active) return null;
  return (
    <div role="tabpanel" className={className}>
      {children}
    </div>
  );
};

TabPanel.displayName = 'TabPanel';

/* -------------------------------------------------------------------------- */
/*  Tabs component                                                             */
/* -------------------------------------------------------------------------- */

const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  variant = 'underline',
  fullWidth = false,
  size = 'md',
  className = '',
}) => {
  const tabListRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});

  /* --- Animated underline indicator --- */
  const updateIndicator = useCallback(() => {
    if (variant !== 'underline' || !tabListRef.current) return;
    const activeEl = tabListRef.current.querySelector<HTMLElement>(
      `[data-tab-key="${activeTab}"]`
    );
    if (activeEl) {
      setIndicatorStyle({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
      });
    }
  }, [activeTab, variant]);

  useEffect(() => {
    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator]);

  /* --- Keyboard navigation --- */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const enabledTabs = tabs.filter((t) => !t.disabled);
    const currentIndex = enabledTabs.findIndex((t) => t.key === activeTab);

    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % enabledTabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = enabledTabs.length - 1;
    }

    if (nextIndex !== null) {
      e.preventDefault();
      onTabChange(enabledTabs[nextIndex].key);
    }
  };

  /* --- Variant-specific styles --- */
  const sizeClasses = size === 'sm' ? 'text-sm' : 'text-sm';
  const paddingClasses = size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-2.5';

  const getTabClasses = (tab: Tab): string => {
    const isActive = tab.key === activeTab;
    const isDisabled = !!tab.disabled;

    const base = [
      'inline-flex items-center gap-2 font-medium whitespace-nowrap transition-colors',
      sizeClasses,
      paddingClasses,
      fullWidth ? 'flex-1 justify-center' : '',
      isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
    ];

    switch (variant) {
      case 'underline':
        return [
          ...base,
          'border-b-2 -mb-px',
          isActive
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
        ].join(' ');

      case 'pills':
        return [
          ...base,
          'rounded-lg',
          isActive
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
        ].join(' ');

      case 'bordered':
        return [
          ...base,
          'rounded-t-lg border border-b-0',
          isActive
            ? 'bg-white text-blue-600 border-gray-200 relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-white'
            : 'bg-gray-50 text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-100',
        ].join(' ');

      default:
        return base.join(' ');
    }
  };

  const containerClasses = (): string => {
    switch (variant) {
      case 'underline':
        return 'relative border-b border-gray-200';
      case 'pills':
        return 'bg-gray-100 rounded-lg p-1';
      case 'bordered':
        return 'border-b border-gray-200';
      default:
        return '';
    }
  };

  return (
    <div
      ref={tabListRef}
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      className={[
        'flex',
        fullWidth ? '' : 'gap-0',
        containerClasses(),
        className,
      ].join(' ')}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          type="button"
          data-tab-key={tab.key}
          aria-selected={tab.key === activeTab}
          aria-disabled={tab.disabled}
          tabIndex={tab.key === activeTab ? 0 : -1}
          disabled={tab.disabled}
          onClick={() => !tab.disabled && onTabChange(tab.key)}
          className={getTabClasses(tab)}
        >
          {tab.icon && <span className="shrink-0">{tab.icon}</span>}
          <span>{tab.label}</span>
          {tab.count !== undefined && (
            <span
              className={[
                'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium',
                tab.key === activeTab && variant === 'pills'
                  ? 'bg-blue-500 text-white'
                  : tab.key === activeTab
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-200 text-gray-600',
              ].join(' ')}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}

      {/* Animated indicator for underline variant */}
      {variant === 'underline' && (
        <span
          className="absolute bottom-0 h-0.5 bg-blue-600 transition-all duration-200 ease-out"
          style={indicatorStyle}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

Tabs.displayName = 'Tabs';

/* -------------------------------------------------------------------------- */
/*  Convenience: Tabs with managed state                                       */
/* -------------------------------------------------------------------------- */

interface TabGroupProps {
  tabs: (Tab & { content: ReactNode })[];
  defaultTab?: string;
  variant?: TabsProps['variant'];
  fullWidth?: boolean;
  size?: TabsProps['size'];
  className?: string;
  panelClassName?: string;
}

const TabGroup: React.FC<TabGroupProps> = ({
  tabs,
  defaultTab,
  variant,
  fullWidth,
  size,
  className = '',
  panelClassName = '',
}) => {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.key || '');

  return (
    <div className={className}>
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        variant={variant}
        fullWidth={fullWidth}
        size={size}
      />
      <div className={`mt-4 ${panelClassName}`}>
        {tabs.map((tab) => (
          <TabPanel key={tab.key} active={tab.key === activeTab}>
            {tab.content}
          </TabPanel>
        ))}
      </div>
    </div>
  );
};

TabGroup.displayName = 'TabGroup';

/* -------------------------------------------------------------------------- */
/*  Exports                                                                    */
/* -------------------------------------------------------------------------- */

export {
  Tabs,
  TabPanel,
  TabGroup,
  type Tab,
  type TabsProps,
  type TabPanelProps,
  type TabGroupProps,
};
export default Tabs;
