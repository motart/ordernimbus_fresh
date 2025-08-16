// Comprehensive Design System for OrderNimbus
// Modern, clean, and professional UI theme

export const theme = {
  // Color Palette - Modern and Professional
  colors: {
    // Primary - Deep Blue/Purple gradient
    primary: {
      50: '#f0f4ff',
      100: '#e0e9ff',
      200: '#c7d6ff',
      300: '#a5b9ff',
      400: '#7b91ff',
      500: '#5b6cff',
      600: '#4754e6',
      700: '#3940c9',
      800: '#3134a3',
      900: '#2b2d81',
      gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    },
    
    // Secondary - Teal/Cyan
    secondary: {
      50: '#f0fdfa',
      100: '#ccfbf1',
      200: '#99f6e4',
      300: '#5eead4',
      400: '#2dd4bf',
      500: '#14b8a6',
      600: '#0d9488',
      700: '#0f766e',
      800: '#115e59',
      900: '#134e4a',
    },
    
    // Success - Green
    success: {
      light: '#86efac',
      main: '#22c55e',
      dark: '#16a34a',
      bg: '#f0fdf4',
    },
    
    // Warning - Amber
    warning: {
      light: '#fde047',
      main: '#eab308',
      dark: '#ca8a04',
      bg: '#fefce8',
    },
    
    // Error - Red
    error: {
      light: '#fca5a5',
      main: '#ef4444',
      dark: '#dc2626',
      bg: '#fef2f2',
    },
    
    // Info - Blue
    info: {
      light: '#93c5fd',
      main: '#3b82f6',
      dark: '#2563eb',
      bg: '#eff6ff',
    },
    
    // Neutral - Gray
    neutral: {
      50: '#fafafa',
      100: '#f4f4f5',
      200: '#e4e4e7',
      300: '#d4d4d8',
      400: '#a1a1aa',
      500: '#71717a',
      600: '#52525b',
      700: '#3f3f46',
      800: '#27272a',
      900: '#18181b',
    },
    
    // Background colors
    background: {
      primary: '#ffffff',
      secondary: '#f8fafc',
      tertiary: '#f1f5f9',
      elevated: '#ffffff',
      overlay: 'rgba(0, 0, 0, 0.5)',
    },
    
    // Text colors
    text: {
      primary: '#1e293b',
      secondary: '#64748b',
      tertiary: '#94a3b8',
      inverse: '#ffffff',
      link: '#3b82f6',
    },
  },
  
  // Typography
  typography: {
    fontFamily: {
      sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      mono: "'Fira Code', 'Monaco', 'Courier New', monospace",
    },
    fontSize: {
      xs: '0.75rem',     // 12px
      sm: '0.875rem',    // 14px
      base: '1rem',      // 16px
      lg: '1.125rem',    // 18px
      xl: '1.25rem',     // 20px
      '2xl': '1.5rem',   // 24px
      '3xl': '1.875rem', // 30px
      '4xl': '2.25rem',  // 36px
      '5xl': '3rem',     // 48px
    },
    fontWeight: {
      light: 300,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75,
      loose: 2,
    },
  },
  
  // Spacing System
  spacing: {
    xs: '0.25rem',   // 4px
    sm: '0.5rem',    // 8px
    md: '1rem',      // 16px
    lg: '1.5rem',    // 24px
    xl: '2rem',      // 32px
    '2xl': '3rem',   // 48px
    '3xl': '4rem',   // 64px
    '4xl': '6rem',   // 96px
  },
  
  // Border Radius
  borderRadius: {
    none: '0',
    sm: '0.25rem',   // 4px
    base: '0.5rem',  // 8px
    md: '0.75rem',   // 12px
    lg: '1rem',      // 16px
    xl: '1.5rem',    // 24px
    '2xl': '2rem',   // 32px
    full: '9999px',
  },
  
  // Shadows
  shadows: {
    xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    base: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    md: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    lg: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    xl: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
    none: 'none',
    
    // Colored shadows for buttons
    primary: '0 10px 25px -5px rgba(91, 108, 255, 0.25)',
    success: '0 10px 25px -5px rgba(34, 197, 94, 0.25)',
    error: '0 10px 25px -5px rgba(239, 68, 68, 0.25)',
  },
  
  // Transitions
  transitions: {
    fast: 'all 0.15s ease',
    base: 'all 0.3s ease',
    slow: 'all 0.5s ease',
    
    // Specific transitions
    fade: 'opacity 0.3s ease',
    slide: 'transform 0.3s ease',
    scale: 'transform 0.2s ease',
    color: 'color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease',
  },
  
  // Breakpoints for responsive design
  breakpoints: {
    xs: '480px',
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
  
  // Z-index layers
  zIndex: {
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
    notification: 1080,
  },
  
  // Animation keyframes
  animations: {
    fadeIn: `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `,
    slideInUp: `
      @keyframes slideInUp {
        from {
          transform: translateY(20px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
    `,
    slideInRight: `
      @keyframes slideInRight {
        from {
          transform: translateX(-20px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `,
    scaleIn: `
      @keyframes scaleIn {
        from {
          transform: scale(0.95);
          opacity: 0;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }
    `,
    pulse: `
      @keyframes pulse {
        0%, 100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }
    `,
    shimmer: `
      @keyframes shimmer {
        0% {
          background-position: -1000px 0;
        }
        100% {
          background-position: 1000px 0;
        }
      }
    `,
    float: `
      @keyframes float {
        0%, 100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-10px);
        }
      }
    `,
  },
};

// Helper function to get CSS variables
export const getCSSVariables = () => {
  const root = document.documentElement;
  return {
    setPrimary: (color: string) => root.style.setProperty('--primary-color', color),
    setSecondary: (color: string) => root.style.setProperty('--secondary-color', color),
    setBackground: (color: string) => root.style.setProperty('--bg-color', color),
    setText: (color: string) => root.style.setProperty('--text-color', color),
  };
};

// Utility classes for consistent styling
export const styleUtils = {
  // Card styles
  card: `
    background: white;
    border-radius: ${theme.borderRadius.lg};
    box-shadow: ${theme.shadows.base};
    padding: ${theme.spacing.lg};
    transition: ${theme.transitions.base};
    
    &:hover {
      box-shadow: ${theme.shadows.md};
      transform: translateY(-2px);
    }
  `,
  
  // Button styles
  button: {
    primary: `
      background: ${theme.colors.primary.gradient};
      color: white;
      border: none;
      border-radius: ${theme.borderRadius.md};
      padding: ${theme.spacing.sm} ${theme.spacing.lg};
      font-weight: ${theme.typography.fontWeight.semibold};
      transition: ${theme.transitions.base};
      cursor: pointer;
      
      &:hover {
        transform: translateY(-2px);
        box-shadow: ${theme.shadows.primary};
      }
      
      &:active {
        transform: translateY(0);
      }
    `,
    secondary: `
      background: ${theme.colors.secondary[100]};
      color: ${theme.colors.secondary[700]};
      border: 1px solid ${theme.colors.secondary[300]};
      border-radius: ${theme.borderRadius.md};
      padding: ${theme.spacing.sm} ${theme.spacing.lg};
      font-weight: ${theme.typography.fontWeight.medium};
      transition: ${theme.transitions.base};
      cursor: pointer;
      
      &:hover {
        background: ${theme.colors.secondary[200]};
        border-color: ${theme.colors.secondary[400]};
      }
    `,
  },
  
  // Input styles
  input: `
    background: white;
    border: 2px solid ${theme.colors.neutral[200]};
    border-radius: ${theme.borderRadius.md};
    padding: ${theme.spacing.sm} ${theme.spacing.md};
    font-size: ${theme.typography.fontSize.base};
    transition: ${theme.transitions.color};
    
    &:focus {
      outline: none;
      border-color: ${theme.colors.primary[400]};
      box-shadow: 0 0 0 3px ${theme.colors.primary[100]};
    }
    
    &:hover {
      border-color: ${theme.colors.neutral[300]};
    }
  `,
  
  // Badge styles
  badge: {
    success: `
      background: ${theme.colors.success.bg};
      color: ${theme.colors.success.dark};
      padding: ${theme.spacing.xs} ${theme.spacing.sm};
      border-radius: ${theme.borderRadius.full};
      font-size: ${theme.typography.fontSize.sm};
      font-weight: ${theme.typography.fontWeight.semibold};
    `,
    warning: `
      background: ${theme.colors.warning.bg};
      color: ${theme.colors.warning.dark};
      padding: ${theme.spacing.xs} ${theme.spacing.sm};
      border-radius: ${theme.borderRadius.full};
      font-size: ${theme.typography.fontSize.sm};
      font-weight: ${theme.typography.fontWeight.semibold};
    `,
    error: `
      background: ${theme.colors.error.bg};
      color: ${theme.colors.error.dark};
      padding: ${theme.spacing.xs} ${theme.spacing.sm};
      border-radius: ${theme.borderRadius.full};
      font-size: ${theme.typography.fontSize.sm};
      font-weight: ${theme.typography.fontWeight.semibold};
    `,
    info: `
      background: ${theme.colors.info.bg};
      color: ${theme.colors.info.dark};
      padding: ${theme.spacing.xs} ${theme.spacing.sm};
      border-radius: ${theme.borderRadius.full};
      font-size: ${theme.typography.fontSize.sm};
      font-weight: ${theme.typography.fontWeight.semibold};
    `,
  },
};

export default theme;