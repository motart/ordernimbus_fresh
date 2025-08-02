/**
 * ChatBot Integration Tests
 * 
 * End-to-end testing scenarios that simulate real user workflows
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatBot from '../ChatBot';

// Real-world test scenarios
describe('ChatBot Integration Tests', () => {
  const defaultProps = {
    userEmail: 'test@example.com',
    isVisible: true,
    onToggle: jest.fn()
  };

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

  // Crypto is already mocked in setupTests.ts

  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  describe('Complete User Journey', () => {
    it('should handle complete conversation flow', async () => {
      const user = userEvent.setup();
      
      render(<ChatBot {...defaultProps} />);
      
      // Wait for component to initialize
      await waitFor(() => {
        expect(screen.getByText('OrderNimbus AI')).toBeInTheDocument();
      }, { timeout: 10000 });
      
      // Should show welcome message
      expect(screen.getByText(/Hello! I'm your OrderNimbus AI assistant/)).toBeInTheDocument();
      
      // User sends first message
      const input = screen.getByPlaceholderText(/ask me about/i);
      await user.type(input, 'What is OrderNimbus?');
      await user.click(screen.getByRole('button', { name: /send/i }));
      
      // Should show user message
      expect(screen.getByText('What is OrderNimbus?')).toBeInTheDocument();
      
      // Wait for AI response
      await waitFor(() => {
        expect(screen.getByText(/OrderNimbus is/i)).toBeInTheDocument();
      }, { timeout: 5000 });
      
      // Send follow-up message
      await user.type(input, 'Tell me about forecasting');
      await user.keyboard('{Enter}');
      
      // Should show second user message
      expect(screen.getByText('Tell me about forecasting')).toBeInTheDocument();
      
      // Wait for second response
      await waitFor(() => {
        expect(screen.getAllByText(/forecasting/i).length).toBeGreaterThan(1);
      }, { timeout: 5000 });
    });

    it('should persist conversation across sessions', async () => {
      const user = userEvent.setup();
      
      // First session
      const { unmount } = render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/ask me about/i)).toBeInTheDocument();
      });
      
      const input = screen.getByPlaceholderText(/ask me about/i);
      await user.type(input, 'Persistent message');
      await user.click(screen.getByRole('button', { name: /send/i }));
      
      // Wait for message to be stored
      await waitFor(() => {
        expect(screen.getByText('Persistent message')).toBeInTheDocument();
      });
      
      unmount();
      
      // Second session - should restore messages
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Persistent message')).toBeInTheDocument();
      }, { timeout: 10000 });
    });

    it('should handle authentication timeout gracefully', async () => {
      // Mock getCurrentUser to timeout
      jest.mock('aws-amplify/auth', () => ({
        getCurrentUser: jest.fn(() => new Promise(() => {})) // Never resolves
      }));
      
      render(<ChatBot {...defaultProps} />);
      
      // Should fall back to limited mode
      await waitFor(() => {
        expect(screen.getByText('Limited Mode')).toBeInTheDocument();
      }, { timeout: 10000 });
      
      // Should still be functional
      const input = screen.getByPlaceholderText(/ask me about/i);
      expect(input).toBeEnabled();
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should recover from storage failures', async () => {
      const user = userEvent.setup();
      
      // Mock storage to fail
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });
      
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/ask me about/i)).toBeInTheDocument();
      });
      
      // Should still allow sending messages
      const input = screen.getByPlaceholderText(/ask me about/i);
      await user.type(input, 'Test message with storage failure');
      await user.click(screen.getByRole('button', { name: /send/i }));
      
      expect(screen.getByText('Test message with storage failure')).toBeInTheDocument();
    });

    it('should handle network failures during message sending', async () => {
      const user = userEvent.setup();
      
      // Mock fetch to fail
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/ask me about/i)).toBeInTheDocument();
      });
      
      const input = screen.getByPlaceholderText(/ask me about/i);
      await user.type(input, 'Network failure test');
      await user.click(screen.getByRole('button', { name: /send/i }));
      
      // Should show fallback response
      await waitFor(() => {
        expect(screen.getByText(/I'm here to help! While I'm having some technical difficulties/)).toBeInTheDocument();
      });
    });

    it('should handle component remounting', async () => {
      const user = userEvent.setup();
      
      const { rerender } = render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/ask me about/i)).toBeInTheDocument();
      });
      
      // Send a message
      const input = screen.getByPlaceholderText(/ask me about/i);
      await user.type(input, 'Message before remount');
      await user.click(screen.getByRole('button', { name: /send/i }));
      
      await waitFor(() => {
        expect(screen.getByText('Message before remount')).toBeInTheDocument();
      });
      
      // Remount component
      rerender(<ChatBot {...defaultProps} />);
      
      // Should restore previous state
      await waitFor(() => {
        expect(screen.getByText('Message before remount')).toBeInTheDocument();
      });
    });
  });

  describe('Performance and UX', () => {
    it('should handle rapid message sending', async () => {
      const user = userEvent.setup();
      
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/ask me about/i)).toBeInTheDocument();
      });
      
      const input = screen.getByPlaceholderText(/ask me about/i);
      const sendButton = screen.getByRole('button', { name: /send/i });
      
      // Send multiple messages rapidly
      for (let i = 1; i <= 3; i++) {
        await user.clear(input);
        await user.type(input, `Rapid message ${i}`);
        await user.click(sendButton);
        
        // Verify message appears
        expect(screen.getByText(`Rapid message ${i}`)).toBeInTheDocument();
      }
      
      // Should handle all messages
      expect(screen.getByText('Rapid message 1')).toBeInTheDocument();
      expect(screen.getByText('Rapid message 2')).toBeInTheDocument();
      expect(screen.getByText('Rapid message 3')).toBeInTheDocument();
    });

    it('should auto-scroll to new messages', async () => {
      const user = userEvent.setup();
      
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/ask me about/i)).toBeInTheDocument();
      });
      
      const input = screen.getByPlaceholderText(/ask me about/i);
      
      // Send enough messages to cause scrolling
      for (let i = 1; i <= 10; i++) {
        await user.clear(input);
        await user.type(input, `Message ${i} with enough content to fill space and test scrolling behavior`);
        await user.keyboard('{Enter}');
        
        await waitFor(() => {
          expect(screen.getByText(`Message ${i} with enough content to fill space and test scrolling behavior`)).toBeInTheDocument();
        });
      }
      
      // Last message should be visible
      expect(screen.getByText('Message 10 with enough content to fill space and test scrolling behavior')).toBeInTheDocument();
    });

    it('should show typing indicator during response', async () => {
      const user = userEvent.setup();
      
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/ask me about/i)).toBeInTheDocument();
      });
      
      const input = screen.getByPlaceholderText(/ask me about/i);
      await user.type(input, 'Test typing indicator');
      await user.click(screen.getByRole('button', { name: /send/i }));
      
      // Should briefly show typing indicator
      expect(screen.getByText('AI is thinking...')).toBeInTheDocument();
    });
  });

  describe('Mobile and Responsive Behavior', () => {
    it('should handle small screen sizes', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });
      
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 667,
      });
      
      render(<ChatBot {...defaultProps} />);
      
      // Component should render without breaking
      expect(screen.getByText('OrderNimbus AI')).toBeInTheDocument();
    });

    it('should handle touch interactions', async () => {
      const user = userEvent.setup();
      
      render(<ChatBot {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/ask me about/i)).toBeInTheDocument();
      });
      
      // Simulate touch interactions
      const sendButton = screen.getByRole('button', { name: /send/i });
      fireEvent.touchStart(sendButton);
      fireEvent.touchEnd(sendButton);
      
      // Should not cause errors
      expect(sendButton).toBeInTheDocument();
    });
  });
});