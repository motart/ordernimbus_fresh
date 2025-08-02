/**
 * ChatBot Component Tests
 * 
 * Comprehensive test suite covering:
 * - Component rendering
 * - Error boundary behavior
 * - Authentication failures
 * - Message handling
 * - Fallback mode
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-hot-toast';
import ChatBot from '../ChatBot';
import * as useSecureDataModule from '../../hooks/useSecureData';
import MockChatbotAPI from '../../utils/MockChatbotAPI';

// Mock dependencies
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

jest.mock('../../hooks/useSecureData');
jest.mock('../../utils/MockChatbotAPI');

const mockUseSecureData = useSecureDataModule.default as jest.MockedFunction<typeof useSecureDataModule.default>;
const mockChatbotAPI = MockChatbotAPI as jest.Mocked<typeof MockChatbotAPI>;

describe('ChatBot Component', () => {
  const defaultProps = {
    userEmail: 'test@example.com',
    isVisible: true,
    onToggle: jest.fn()
  };

  const mockSecureDataResult = {
    isInitialized: true,
    error: null,
    setData: jest.fn(),
    getData: jest.fn(),
    removeData: jest.fn(),
    clearAllData: jest.fn(),
    userContext: {
      userId: 'test-user-123',
      email: 'test@example.com'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset all mocks to default successful state
    mockUseSecureData.mockReturnValue(mockSecureDataResult);
    
    // Mock the API instance
    const mockAPIInstance = {
      processMessage: jest.fn().mockResolvedValue({
        response: 'Test response',
        metadata: {
          sources: [],
          confidence: 0.9,
          processingTime: 100
        }
      })
    };
    mockChatbotAPI.getInstance = jest.fn().mockReturnValue(mockAPIInstance);
    
    // Suppress console errors during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('Component Rendering', () => {
    it('should render chat toggle button when closed', () => {
      render(<ChatBot {...defaultProps} isVisible={false} />);
      
      expect(screen.getByRole('button')).toBeInTheDocument();
      expect(screen.getByText('AI')).toBeInTheDocument();
    });

    it('should render chat interface when open', async () => {
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('OrderNimbus AI')).toBeInTheDocument();
        expect(screen.getByText('Online')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/ask me about/i)).toBeInTheDocument();
      });
    });

    it('should show welcome message on initialization', async () => {
      mockSecureDataResult.getData.mockResolvedValue(null);
      
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(/Hello! I'm your OrderNimbus AI assistant/)).toBeInTheDocument();
      });
    });
  });

  describe('Error Boundary', () => {
    it('should catch and display error when component crashes', () => {
      // Mock console.error to avoid test output
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Force an error by making useSecureData throw
      mockUseSecureData.mockImplementation(() => {
        throw new Error('Test error');
      });
      
      render(<ChatBot {...defaultProps} />);
      
      expect(screen.getByText('Chat temporarily unavailable')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
      
      consoleSpy.mockRestore();
    });

    it('should allow retry after error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // First render throws error
      mockUseSecureData.mockImplementationOnce(() => {
        throw new Error('Test error');
      });
      
      const { rerender } = render(<ChatBot {...defaultProps} />);
      
      expect(screen.getByText('Chat temporarily unavailable')).toBeInTheDocument();
      
      // Mock successful retry
      mockUseSecureData.mockReturnValue(mockSecureDataResult);
      
      fireEvent.click(screen.getByText('Try Again'));
      
      // Component should recover
      await waitFor(() => {
        expect(screen.getByText('OrderNimbus AI')).toBeInTheDocument();
      });
      
      consoleSpy.mockRestore();
    });
  });

  describe('Authentication and Initialization', () => {
    it('should handle secure data initialization failure gracefully', async () => {
      mockUseSecureData.mockReturnValue({
        ...mockSecureDataResult,
        isInitialized: false,
        error: 'Authentication failed',
        userContext: null
      });
      
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Limited Mode')).toBeInTheDocument();
      });
    });

    it('should work in fallback mode when authentication fails', async () => {
      mockUseSecureData.mockReturnValue({
        ...mockSecureDataResult,
        isInitialized: true,
        userContext: {
          userId: 'temp-user-123',
          email: 'temp@example.com'
        }
      });
      
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Limited Mode')).toBeInTheDocument();
      });
      
      // Should still allow message sending
      const input = screen.getByPlaceholderText(/ask me about/i);
      const sendButton = screen.getByRole('button', { name: /send/i });
      
      await userEvent.type(input, 'Test message');
      fireEvent.click(sendButton);
      
      await waitFor(() => {
        expect(screen.getByText('Test message')).toBeInTheDocument();
      });
    });

    it('should show warning indicator in fallback mode', async () => {
      mockUseSecureData.mockReturnValue({
        ...mockSecureDataResult,
        userContext: {
          userId: 'temp-user-123',
          email: 'temp@example.com'
        }
      });
      
      render(<ChatBot {...defaultProps} isVisible={false} />);
      
      await waitFor(() => {
        expect(screen.getByText('⚠️')).toBeInTheDocument();
      });
    });
  });

  describe('Message Handling', () => {
    it('should send and receive messages successfully', async () => {
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/ask me about/i)).toBeInTheDocument();
      });
      
      const input = screen.getByPlaceholderText(/ask me about/i);
      const sendButton = screen.getByRole('button', { name: /send/i });
      
      await userEvent.type(input, 'Hello AI');
      fireEvent.click(sendButton);
      
      // Should show user message
      expect(screen.getByText('Hello AI')).toBeInTheDocument();
      
      // Should show AI response
      await waitFor(() => {
        expect(screen.getByText('Test response')).toBeInTheDocument();
      });
      
      // Should clear input
      expect(input).toHaveValue('');
    });

    it('should handle API failures gracefully', async () => {
      const mockAPIInstance = {
        processMessage: jest.fn().mockRejectedValue(new Error('API Error'))
      };
      mockChatbotAPI.getInstance = jest.fn().mockReturnValue(mockAPIInstance);
      
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/ask me about/i)).toBeInTheDocument();
      });
      
      const input = screen.getByPlaceholderText(/ask me about/i);
      const sendButton = screen.getByRole('button', { name: /send/i });
      
      await userEvent.type(input, 'Test message');
      fireEvent.click(sendButton);
      
      // Should show fallback response
      await waitFor(() => {
        expect(screen.getByText(/I'm here to help! While I'm having some technical difficulties/)).toBeInTheDocument();
      });
    });

    it('should disable send button when loading', async () => {
      const mockAPIInstance = {
        processMessage: jest.fn(() => new Promise(resolve => setTimeout(resolve, 1000)))
      };
      mockChatbotAPI.getInstance = jest.fn().mockReturnValue(mockAPIInstance);
      
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/ask me about/i)).toBeInTheDocument();
      });
      
      const input = screen.getByPlaceholderText(/ask me about/i);
      const sendButton = screen.getByRole('button', { name: /send/i });
      
      await userEvent.type(input, 'Test message');
      fireEvent.click(sendButton);
      
      // Send button should be disabled while loading
      expect(sendButton).toBeDisabled();
    });

    it('should handle Enter key to send messages', async () => {
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/ask me about/i)).toBeInTheDocument();
      });
      
      const input = screen.getByPlaceholderText(/ask me about/i);
      
      await userEvent.type(input, 'Test message{enter}');
      
      // Should show user message
      expect(screen.getByText('Test message')).toBeInTheDocument();
    });
  });

  describe('Conversation Management', () => {
    it('should clear conversation when clear button is clicked', async () => {
      mockSecureDataResult.getData.mockResolvedValue([
        {
          id: 'msg-1',
          content: 'Previous message',
          type: 'user',
          timestamp: new Date()
        }
      ]);
      
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Previous message')).toBeInTheDocument();
      });
      
      const clearButton = screen.getByTitle('Clear conversation');
      fireEvent.click(clearButton);
      
      await waitFor(() => {
        expect(screen.queryByText('Previous message')).not.toBeInTheDocument();
        expect(screen.getByText(/Hello! I'm your OrderNimbus AI assistant/)).toBeInTheDocument();
      });
      
      expect(mockToast.success).toHaveBeenCalledWith('Conversation cleared');
    });

    it('should restore conversation history from storage', async () => {
      const savedMessages = [
        {
          id: 'msg-1',
          content: 'Previous user message',
          type: 'user',
          timestamp: new Date()
        },
        {
          id: 'msg-2',
          content: 'Previous AI response',
          type: 'assistant',
          timestamp: new Date()
        }
      ];
      
      mockSecureDataResult.getData.mockResolvedValue(savedMessages);
      
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Previous user message')).toBeInTheDocument();
        expect(screen.getByText('Previous AI response')).toBeInTheDocument();
      });
    });
  });

  describe('UI Interactions', () => {
    it('should toggle expanded state', async () => {
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByTitle(/expand/i)).toBeInTheDocument();
      });
      
      const expandButton = screen.getByTitle(/expand/i);
      fireEvent.click(expandButton);
      
      expect(screen.getByTitle(/minimize/i)).toBeInTheDocument();
    });

    it('should close chat when close button is clicked', async () => {
      const onToggle = jest.fn();
      render(<ChatBot {...defaultProps} onToggle={onToggle} />);
      
      await waitFor(() => {
        expect(screen.getByTitle('Close chat')).toBeInTheDocument();
      });
      
      const closeButton = screen.getByTitle('Close chat');
      fireEvent.click(closeButton);
      
      expect(onToggle).toHaveBeenCalled();
    });

    it('should show character count', async () => {
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('0/1000')).toBeInTheDocument();
      });
      
      const input = screen.getByPlaceholderText(/ask me about/i);
      await userEvent.type(input, 'Test');
      
      expect(screen.getByText('4/1000')).toBeInTheDocument();
    });
  });

  describe('Development Mode Features', () => {
    it('should show debug info in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      render(<ChatBot {...defaultProps} />);
      
      expect(screen.getByText(/Initialized: ✅/)).toBeInTheDocument();
      expect(screen.getByText(/User Context: ✅/)).toBeInTheDocument();
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should not show debug info in production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      render(<ChatBot {...defaultProps} />);
      
      expect(screen.queryByText(/Initialized:/)).not.toBeInTheDocument();
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
      });
      
      expect(screen.getByPlaceholderText(/ask me about/i)).toBeInTheDocument();
    });

    it('should be keyboard navigable', async () => {
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/ask me about/i)).toBeInTheDocument();
      });
      
      const input = screen.getByPlaceholderText(/ask me about/i);
      
      // Should focus on input
      input.focus();
      expect(document.activeElement).toBe(input);
      
      // Should navigate to send button with Tab
      fireEvent.keyDown(input, { key: 'Tab' });
      // Note: Full tab navigation testing would require a more complex setup
    });
  });
});