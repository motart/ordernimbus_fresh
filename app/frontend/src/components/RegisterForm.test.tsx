import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterForm from './RegisterForm';
import { AuthProvider } from '../contexts/AuthContext';
import { ConfigProvider } from '../contexts/ConfigContext';
import toast from 'react-hot-toast';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock the auth context
const mockRegister = jest.fn();
const mockConfirmRegistration = jest.fn();
const mockLogin = jest.fn();

jest.mock('../contexts/AuthContext', () => ({
  ...jest.requireActual('../contexts/AuthContext'),
  useAuth: () => ({
    register: mockRegister,
    confirmRegistration: mockConfirmRegistration,
    login: mockLogin,
    isAuthenticated: false,
    user: null,
  }),
}));

// Wrapper component with providers
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ConfigProvider>
    <AuthProvider>
      {children}
    </AuthProvider>
  </ConfigProvider>
);

describe('RegisterForm Component', () => {
  const mockSwitchToLogin = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Form Rendering', () => {
    it('should render all required form fields', () => {
      render(
        <TestWrapper>
          <RegisterForm onSwitchToLogin={mockSwitchToLogin} />
        </TestWrapper>
      );

      expect(screen.getByPlaceholderText(/first name/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/last name/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/email address/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/company name/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/confirm password/i)).toBeInTheDocument();
    });

    it('should render create account button', () => {
      render(
        <TestWrapper>
          <RegisterForm onSwitchToLogin={mockSwitchToLogin} />
        </TestWrapper>
      );

      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    });

    it('should render login link', () => {
      render(
        <TestWrapper>
          <RegisterForm onSwitchToLogin={mockSwitchToLogin} />
        </TestWrapper>
      );

      expect(screen.getByText(/already have an account/i)).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should show error when required fields are empty', async () => {
      render(
        <TestWrapper>
          <RegisterForm onSwitchToLogin={mockSwitchToLogin} />
        </TestWrapper>
      );

      const submitButton = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Please fill in all required fields');
      });
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('should show error when passwords do not match', async () => {
      render(
        <TestWrapper>
          <RegisterForm onSwitchToLogin={mockSwitchToLogin} />
        </TestWrapper>
      );

      const user = userEvent.setup();
      
      await user.type(screen.getByPlaceholderText(/email address/i), 'test@example.com');
      await user.type(screen.getByPlaceholderText(/company name/i), 'Test Company');
      await user.type(screen.getByPlaceholderText('Password'), 'TestPassword123!');
      await user.type(screen.getByPlaceholderText(/confirm password/i), 'DifferentPassword123!');

      const submitButton = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Passwords do not match');
      });
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('should show error when password is too short', async () => {
      render(
        <TestWrapper>
          <RegisterForm onSwitchToLogin={mockSwitchToLogin} />
        </TestWrapper>
      );

      const user = userEvent.setup();
      
      await user.type(screen.getByPlaceholderText(/email address/i), 'test@example.com');
      await user.type(screen.getByPlaceholderText(/company name/i), 'Test Company');
      await user.type(screen.getByPlaceholderText('Password'), 'Short1!');
      await user.type(screen.getByPlaceholderText(/confirm password/i), 'Short1!');

      const submitButton = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Password must be at least 8 characters long');
      });
      expect(mockRegister).not.toHaveBeenCalled();
    });
  });

  describe('Successful Registration', () => {
    it('should call register with correct data when form is valid', async () => {
      mockRegister.mockResolvedValue({
        success: true,
        needsVerification: false
      });

      render(
        <TestWrapper>
          <RegisterForm onSwitchToLogin={mockSwitchToLogin} />
        </TestWrapper>
      );

      const user = userEvent.setup();
      
      await user.type(screen.getByPlaceholderText(/first name/i), 'John');
      await user.type(screen.getByPlaceholderText(/last name/i), 'Doe');
      await user.type(screen.getByPlaceholderText(/email address/i), 'john@example.com');
      await user.type(screen.getByPlaceholderText(/company name/i), 'Test Company');
      await user.type(screen.getByPlaceholderText('Password'), 'TestPassword123!');
      await user.type(screen.getByPlaceholderText(/confirm password/i), 'TestPassword123!');

      const submitButton = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith(
          'john@example.com',
          'TestPassword123!',
          'Test Company',
          'John',
          'Doe'
        );
      });

      expect(toast.success).toHaveBeenCalledWith('Account created successfully! Welcome to OrderNimbus!');
    });

    it('should show verification form when registration needs verification', async () => {
      mockRegister.mockResolvedValue({
        success: true,
        needsVerification: true
      });

      render(
        <TestWrapper>
          <RegisterForm onSwitchToLogin={mockSwitchToLogin} />
        </TestWrapper>
      );

      const user = userEvent.setup();
      
      await user.type(screen.getByPlaceholderText(/email address/i), 'john@example.com');
      await user.type(screen.getByPlaceholderText(/company name/i), 'Test Company');
      await user.type(screen.getByPlaceholderText('Password'), 'TestPassword123!');
      await user.type(screen.getByPlaceholderText(/confirm password/i), 'TestPassword123!');

      const submitButton = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Account created! Please check your email for verification code.');
      });

      // Verification form should appear
      expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/enter verification code/i)).toBeInTheDocument();
    });
  });

  describe('Email Verification', () => {
    it('should handle successful verification', async () => {
      // First trigger registration with verification needed
      mockRegister.mockResolvedValue({
        success: true,
        needsVerification: true
      });

      mockConfirmRegistration.mockResolvedValue({
        success: true
      });

      mockLogin.mockResolvedValue({
        success: true
      });

      render(
        <TestWrapper>
          <RegisterForm onSwitchToLogin={mockSwitchToLogin} />
        </TestWrapper>
      );

      const user = userEvent.setup();
      
      // Fill registration form
      await user.type(screen.getByPlaceholderText(/email address/i), 'john@example.com');
      await user.type(screen.getByPlaceholderText(/company name/i), 'Test Company');
      await user.type(screen.getByPlaceholderText('Password'), 'TestPassword123!');
      await user.type(screen.getByPlaceholderText(/confirm password/i), 'TestPassword123!');

      const submitButton = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitButton);

      // Wait for verification form
      await waitFor(() => {
        expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
      });

      // Enter verification code
      await user.type(screen.getByPlaceholderText(/enter verification code/i), '123456');
      
      const verifyButton = screen.getByRole('button', { name: /verify email/i });
      fireEvent.click(verifyButton);

      await waitFor(() => {
        expect(mockConfirmRegistration).toHaveBeenCalledWith('john@example.com', '123456');
      });

      expect(toast.success).toHaveBeenCalledWith('Email verified! Logging you in...');
      expect(mockLogin).toHaveBeenCalledWith('john@example.com', 'TestPassword123!');
    });

    it('should show error for invalid verification code', async () => {
      mockRegister.mockResolvedValue({
        success: true,
        needsVerification: true
      });

      mockConfirmRegistration.mockResolvedValue({
        success: false,
        error: 'Invalid verification code'
      });

      render(
        <TestWrapper>
          <RegisterForm onSwitchToLogin={mockSwitchToLogin} />
        </TestWrapper>
      );

      const user = userEvent.setup();
      
      // Fill and submit registration form
      await user.type(screen.getByPlaceholderText(/email address/i), 'john@example.com');
      await user.type(screen.getByPlaceholderText(/company name/i), 'Test Company');
      await user.type(screen.getByPlaceholderText('Password'), 'TestPassword123!');
      await user.type(screen.getByPlaceholderText(/confirm password/i), 'TestPassword123!');

      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      // Wait for verification form
      await waitFor(() => {
        expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
      });

      // Enter wrong verification code
      await user.type(screen.getByPlaceholderText(/enter verification code/i), 'wrong');
      fireEvent.click(screen.getByRole('button', { name: /verify email/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Invalid verification code');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle registration failure', async () => {
      mockRegister.mockResolvedValue({
        success: false,
        error: 'User already exists'
      });

      render(
        <TestWrapper>
          <RegisterForm onSwitchToLogin={mockSwitchToLogin} />
        </TestWrapper>
      );

      const user = userEvent.setup();
      
      await user.type(screen.getByPlaceholderText(/email address/i), 'existing@example.com');
      await user.type(screen.getByPlaceholderText(/company name/i), 'Test Company');
      await user.type(screen.getByPlaceholderText('Password'), 'TestPassword123!');
      await user.type(screen.getByPlaceholderText(/confirm password/i), 'TestPassword123!');

      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('User already exists');
      });
    });

    it('should handle network errors gracefully', async () => {
      mockRegister.mockRejectedValue(new Error('Network error'));

      render(
        <TestWrapper>
          <RegisterForm onSwitchToLogin={mockSwitchToLogin} />
        </TestWrapper>
      );

      const user = userEvent.setup();
      
      await user.type(screen.getByPlaceholderText(/email address/i), 'test@example.com');
      await user.type(screen.getByPlaceholderText(/company name/i), 'Test Company');
      await user.type(screen.getByPlaceholderText('Password'), 'TestPassword123!');
      await user.type(screen.getByPlaceholderText(/confirm password/i), 'TestPassword123!');

      fireEvent.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Registration failed. Please try again.');
      });
    });
  });

  describe('Navigation', () => {
    it('should call onSwitchToLogin when login link is clicked', () => {
      render(
        <TestWrapper>
          <RegisterForm onSwitchToLogin={mockSwitchToLogin} />
        </TestWrapper>
      );

      const loginLink = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(loginLink);

      expect(mockSwitchToLogin).toHaveBeenCalled();
    });
  });
});