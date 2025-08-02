// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

/**
 * Additional test setup for ChatBot and other components
 */

// Mock Web Crypto API
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
      importKey: jest.fn().mockResolvedValue({}),
      encrypt: jest.fn().mockResolvedValue(new ArrayBuffer(16)),
      decrypt: jest.fn().mockResolvedValue(new ArrayBuffer(16))
    },
    getRandomValues: jest.fn((arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    })
  }
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index: number) => Object.keys(store)[index] || null)
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock AWS Amplify
jest.mock('aws-amplify/auth', () => ({
  getCurrentUser: jest.fn().mockResolvedValue({
    userId: 'test-user-123',
    signInDetails: {
      loginId: 'test@example.com'
    }
  })
}));

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
    loading: jest.fn()
  },
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    loading: jest.fn()
  }
}));

// Mock react-icons
jest.mock('react-icons/fi', () => ({
  FiMessageCircle: () => 'MessageCircle',
  FiX: () => 'X',
  FiSend: () => 'Send',
  FiMinus: () => 'Minus',
  FiMaximize2: () => 'Maximize2',
  FiMinimize2: () => 'Minimize2',
  FiCpu: () => 'Cpu',
  FiUser: () => 'User',
  FiClock: () => 'Clock',
  FiInfo: () => 'Info',
  FiAlertTriangle: () => 'AlertTriangle'
}));

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {
    return null;
  }
  disconnect() {
    return null;
  }
  unobserve() {
    return null;
  }
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  observe() {
    return null;
  }
  disconnect() {
    return null;
  }
  unobserve() {
    return null;
  }
};

// Set up test environment variables
process.env.NODE_ENV = 'test';

// Global test utilities
(global as any).testUtils = {
  // Helper to wait for async operations
  waitForAsyncOps: () => new Promise(resolve => setTimeout(resolve, 0)),
  
  // Helper to create mock user context
  createMockUserContext: (overrides = {}) => ({
    userId: 'test-user-123',
    email: 'test@example.com',
    ...overrides
  }),
  
  // Helper to create mock messages
  createMockMessage: (overrides = {}) => ({
    id: `msg-${Date.now()}`,
    content: 'Test message',
    type: 'user',
    timestamp: new Date(),
    ...overrides
  })
};

// Clean up after each test
afterEach(() => {
  localStorageMock.clear();
  jest.clearAllMocks();
});
