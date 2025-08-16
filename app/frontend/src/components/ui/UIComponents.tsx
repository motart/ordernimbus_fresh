import React, { ReactNode, useState, useEffect } from 'react';
import * as Icons from 'react-icons/fi';
import { theme } from '../../styles/theme';

// Simplified motion components for compatibility
const motion = {
  div: React.forwardRef<HTMLDivElement, any>((props, ref) => <div ref={ref} {...props} />),
  button: React.forwardRef<HTMLButtonElement, any>((props, ref) => <button ref={ref} {...props} />),
  span: React.forwardRef<HTMLSpanElement, any>((props, ref) => <span ref={ref} {...props} />),
  input: React.forwardRef<HTMLInputElement, any>((props, ref) => <input ref={ref} {...props} />),
  p: React.forwardRef<HTMLParagraphElement, any>((props, ref) => <p ref={ref} {...props} />)
};

const AnimatePresence: React.FC<{ children: ReactNode; mode?: string }> = ({ children }) => <>{children}</>;

// Animation Variants
export const animations = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.3 }
  },
  slideUp: {
    initial: { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: -20, opacity: 0 },
    transition: { duration: 0.3 }
  },
  slideRight: {
    initial: { x: -20, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: 20, opacity: 0 },
    transition: { duration: 0.3 }
  },
  scaleIn: {
    initial: { scale: 0.95, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.95, opacity: 0 },
    transition: { duration: 0.2 }
  },
  stagger: {
    animate: {
      transition: {
        staggerChildren: 0.1
      }
    }
  }
};

// Modern Card Component
interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  gradient?: boolean;
}

export const Card: React.FC<CardProps> = ({ 
  children, 
  className = '', 
  hover = true,
  onClick,
  gradient = false 
}) => {
  return (
    <motion.div
      className={`modern-card ${className} ${hover ? 'hover-lift' : ''} ${gradient ? 'gradient-border' : ''}`}
      whileHover={hover ? { y: -4, transition: { duration: 0.2 } } : {}}
      whileTap={onClick ? { scale: 0.98 } : {}}
      onClick={onClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        background: gradient ? 'linear-gradient(white, white) padding-box, linear-gradient(135deg, #667eea 0%, #764ba2 100%) border-box' : '',
        border: gradient ? '2px solid transparent' : '',
      }}
    >
      {children}
    </motion.div>
  );
};

// Enhanced Button Component
interface ButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  onClick?: () => void;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  onClick,
  className = ''
}) => {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg'
  };

  const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    success: 'btn-success',
    danger: 'btn-danger',
    ghost: 'btn-ghost'
  };

  return (
    <motion.button
      className={`btn-modern ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled || loading}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      style={{
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer'
      }}
    >
      {loading ? (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          {React.createElement(Icons.FiLoader as any)}
        </motion.div>
      ) : icon}
      {children}
    </motion.button>
  );
};

// Modern Input Component
interface InputProps {
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  icon?: ReactNode;
  error?: string;
  label?: string;
  required?: boolean;
  className?: string;
}

export const Input: React.FC<InputProps> = ({
  type = 'text',
  placeholder,
  value,
  onChange,
  icon,
  error,
  label,
  required = false,
  className = ''
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <div className={`input-group ${className}`}>
      {label && (
        <label className="input-label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="input-icon">
            {icon}
          </div>
        )}
        <motion.input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={`input-modern ${icon ? 'pl-10' : ''} ${error ? 'border-red-500' : ''}`}
          animate={{
            borderColor: focused ? theme.colors.primary[400] : theme.colors.neutral[200]
          }}
        />
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="error-message"
          >
            {error}
          </motion.p>
        )}
      </div>
    </div>
  );
};

// Badge Component
interface BadgeProps {
  children: ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'default';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  pulse?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  icon,
  pulse = false
}) => {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5'
  };

  return (
    <motion.span
      className={`badge badge-${variant} ${sizeClasses[size]} ${pulse ? 'pulse' : ''}`}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
    >
      {icon && <span className="badge-icon">{icon}</span>}
      {children}
      {pulse && <span className="pulse-dot"></span>}
    </motion.span>
  );
};

// Loading Skeleton Component
interface SkeletonProps {
  variant?: 'text' | 'title' | 'card' | 'avatar' | 'button';
  width?: string;
  height?: string;
  count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  count = 1
}) => {
  const variants = {
    text: 'skeleton-text',
    title: 'skeleton-title',
    card: 'skeleton-card',
    avatar: 'skeleton-avatar',
    button: 'skeleton-button'
  };

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={`skeleton ${variants[variant]}`}
          style={{ width, height }}
        />
      ))}
    </>
  );
};

// Modal Component
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true
}) => {
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className={`modal ${sizeClasses[size]}`}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            {(title || showCloseButton) && (
              <div className="modal-header">
                {title && <h2 className="modal-title">{title}</h2>}
                {showCloseButton && (
                  <button className="modal-close" onClick={onClose}>
                    {React.createElement(Icons.FiX as any)}
                  </button>
                )}
              </div>
            )}
            <div className="modal-body">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// Tabs Component
interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  variant?: 'default' | 'pills' | 'underline';
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  defaultTab,
  variant = 'default'
}) => {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);

  return (
    <div className="tabs-container">
      <div className={`tabs-header tabs-${variant}`}>
        {tabs.map((tab) => (
          <motion.button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {tab.icon && <span className="tab-icon">{tab.icon}</span>}
            {tab.label}
            {activeTab === tab.id && variant === 'underline' && (
              <motion.div
                className="tab-indicator"
                layoutId="tabIndicator"
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              />
            )}
          </motion.button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          className="tabs-content"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {tabs.find(tab => tab.id === activeTab)?.content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

// Progress Bar Component
interface ProgressProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  variant?: 'default' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

export const Progress: React.FC<ProgressProps> = ({
  value,
  max = 100,
  label,
  showPercentage = true,
  variant = 'default',
  size = 'md',
  animated = true
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  };

  return (
    <div className="progress-container">
      {(label || showPercentage) && (
        <div className="progress-header">
          {label && <span className="progress-label">{label}</span>}
          {showPercentage && <span className="progress-percentage">{Math.round(percentage)}%</span>}
        </div>
      )}
      <div className={`progress-bar ${sizeClasses[size]}`}>
        <motion.div
          className={`progress-fill progress-${variant} ${animated ? 'animated' : ''}`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
};

// Tooltip Component
interface TooltipProps {
  children: ReactNode;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({
  children,
  content,
  position = 'top'
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="tooltip-wrapper"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            className={`tooltip-content tooltip-${position}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Alert Component
interface AlertProps {
  children: ReactNode;
  variant?: 'info' | 'success' | 'warning' | 'error';
  icon?: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
}

export const Alert: React.FC<AlertProps> = ({
  children,
  variant = 'info',
  icon,
  dismissible = false,
  onDismiss
}) => {
  const [visible, setVisible] = useState(true);

  const handleDismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  const defaultIcons = {
    info: React.createElement(Icons.FiInfo as any),
    success: React.createElement(Icons.FiCheckCircle as any),
    warning: React.createElement(Icons.FiAlertTriangle as any),
    error: React.createElement(Icons.FiXCircle as any)
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={`alert alert-${variant}`}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
        >
          <div className="alert-icon">
            {icon || defaultIcons[variant]}
          </div>
          <div className="alert-content">
            {children}
          </div>
          {dismissible && (
            <button className="alert-dismiss" onClick={handleDismiss}>
              {React.createElement(Icons.FiX as any)}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Dropdown Component
interface DropdownItem {
  id: string;
  label?: string;
  icon?: ReactNode;
  onClick?: () => void;
  divider?: boolean;
}

interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  position?: 'left' | 'right';
}

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  items,
  position = 'left'
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="dropdown">
      <div onClick={() => setIsOpen(!isOpen)}>
        {trigger}
      </div>
      <AnimatePresence>
        {isOpen && (
          <>
            <div className="dropdown-backdrop" onClick={() => setIsOpen(false)} />
            <motion.div
              className={`dropdown-menu dropdown-${position}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {items.map((item, index) => (
                <React.Fragment key={item.id}>
                  {item.divider ? (
                    <div className="dropdown-divider" />
                  ) : (
                    <motion.button
                      className="dropdown-item"
                      onClick={() => {
                        item.onClick?.();
                        setIsOpen(false);
                      }}
                      whileHover={{ backgroundColor: theme.colors.neutral[100] }}
                    >
                      {item.icon && <span className="dropdown-item-icon">{item.icon}</span>}
                      {item.label}
                    </motion.button>
                  )}
                </React.Fragment>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default {
  Card,
  Button,
  Input,
  Badge,
  Skeleton,
  Modal,
  Tabs,
  Progress,
  Tooltip,
  Alert,
  Dropdown,
  animations
};