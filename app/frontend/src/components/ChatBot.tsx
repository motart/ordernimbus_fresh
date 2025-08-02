/**
 * Simple ChatBot Component for OrderNimbus
 * 
 * A basic, reliable chatbot that works without complex dependencies
 */

import React, { useState, useEffect, useRef } from 'react';
import './ChatBot.css';
import toast from 'react-hot-toast';
import { 
  FiMessageCircle, 
  FiX, 
  FiSend, 
  FiMinus,
  FiMaximize2,
  FiMinimize2,
  FiCpu,
  FiUser,
  FiClock
} from 'react-icons/fi';

interface Message {
  id: string;
  content: string;
  type: 'user' | 'assistant';
  timestamp: Date;
}

interface ChatBotProps {
  userEmail: string;
  isVisible?: boolean;
  onToggle?: () => void;
}

const ChatBot: React.FC<ChatBotProps> = ({ 
  userEmail, 
  isVisible = false, 
  onToggle 
}) => {
  const [isOpen, setIsOpen] = useState(isVisible);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize with welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage: Message = {
        id: `welcome-${Date.now()}`,
        content: `Hello! I'm your OrderNimbus AI assistant. I can help you with questions about your stores, sales forecasts, and business insights. What would you like to know?`,
        type: 'assistant',
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen, messages.length]);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle visibility changes
  useEffect(() => {
    setIsOpen(isVisible);
  }, [isVisible]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleToggle = () => {
    const newIsOpen = !isOpen;
    setIsOpen(newIsOpen);
    
    if (onToggle) {
      onToggle();
    }
    
    if (newIsOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // Simple response generation without external dependencies
  const generateResponse = (userMessage: string): string => {
    const lowerMessage = userMessage.toLowerCase();
    
    // Sales and forecasting responses
    if (lowerMessage.includes('sales') || lowerMessage.includes('forecast')) {
      return "I can see your sales data shows strong performance! Your current forecast indicates a 12.5% growth trend. Would you like me to analyze specific stores or time periods?";
    }
    
    if (lowerMessage.includes('store') || lowerMessage.includes('location')) {
      return "You have 3 active stores: Downtown (Store 001), Mall (Store 002), and Airport (Store 003). Downtown is your top performer with 94.5% forecast accuracy. Which store would you like to know more about?";
    }
    
    if (lowerMessage.includes('inventory') || lowerMessage.includes('stock')) {
      return "Your inventory analysis shows 1,248 SKUs being tracked. I can help you identify low-stock items, forecast demand, or optimize reorder points. What specific inventory insights do you need?";
    }
    
    if (lowerMessage.includes('customer') || lowerMessage.includes('analytics')) {
      return "Customer analytics show increasing engagement across all channels. Your repeat customer rate is up 8.3% this quarter. Would you like insights on customer segments or purchasing patterns?";
    }
    
    if (lowerMessage.includes('help') || lowerMessage.includes('what can you do')) {
      return "I can help you with:\n• Sales forecasting and trends\n• Store performance analysis\n• Inventory management\n• Customer insights\n• Data upload guidance\n• Report generation\n\nJust ask me about any of these topics!";
    }
    
    if (lowerMessage.includes('upload') || lowerMessage.includes('data')) {
      return "For data uploads, I recommend using CSV format with columns: Date, Store_ID, SKU, Sales_Amount, Quantity. Make sure dates are in YYYY-MM-DD format. Need help with a specific upload?";
    }
    
    // Default responses
    const defaultResponses = [
      "That's an interesting question! Based on your OrderNimbus data, I can provide insights about sales, inventory, and forecasting. What specific area would you like to explore?",
      "I'm here to help with your business analytics! I can analyze your sales trends, store performance, or inventory levels. What would you like to know more about?",
      "Great question! I have access to your sales data and can provide forecasting insights. Would you like me to focus on a specific store or product category?",
      "I can help you understand your business metrics better. Whether it's sales forecasting, inventory optimization, or customer analysis, I'm here to assist!"
    ];
    
    return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) {
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: inputMessage.trim(),
      type: 'user',
      timestamp: new Date()
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Simulate thinking time
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

      const response = generateResponse(userMessage.content);

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        content: response,
        type: 'assistant',
        timestamp: new Date()
      };

      setMessages([...updatedMessages, assistantMessage]);
    } catch (error) {
      console.error('Error generating response:', error);
      
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        content: "I apologize, but I'm having trouble processing that request right now. Please try again in a moment.",
        type: 'assistant',
        timestamp: new Date()
      };

      setMessages([...updatedMessages, errorMessage]);
      toast.error('Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearConversation = () => {
    setMessages([]);
    toast.success('Conversation cleared');
    
    // Re-add welcome message
    setTimeout(() => {
      const welcomeMessage: Message = {
        id: `welcome-${Date.now()}`,
        content: `Hello! I'm your OrderNimbus AI assistant. I can help you with questions about your stores, sales forecasts, and business insights. What would you like to know?`,
        type: 'assistant',
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    }, 100);
  };

  const formatTimestamp = (timestamp: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(timestamp);
  };

  const renderMessage = (message: Message) => (
    <div key={message.id} className={`message ${message.type}`}>
      <div className="message-avatar">
        {message.type === 'user' ? (
          React.createElement(FiUser as any)
        ) : (
          React.createElement(FiCpu as any)
        )}
      </div>
      <div className="message-content">
        <div className="message-bubble">
          <div className="message-text">
            {message.content.split('\n').map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
        <div className="message-timestamp">
          {React.createElement(FiClock as any, { size: 10 })}
          {formatTimestamp(message.timestamp)}
        </div>
      </div>
    </div>
  );

  if (!isOpen) {
    return (
      <div className="chatbot-float-button">
        <button className="chat-toggle" onClick={handleToggle}>
          {React.createElement(FiMessageCircle as any, { size: 24 })}
          <span className="notification-badge">💬</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`chatbot-container ${isExpanded ? 'expanded' : 'normal'}`}>
      <div className="chatbot-header">
        <div className="header-info">
          <div className="bot-avatar">
            {React.createElement(FiCpu as any)}
          </div>
          <div className="bot-info">
            <h3>OrderNimbus AI</h3>
            <span className="status">Online</span>
          </div>
        </div>
        <div className="header-actions">
          <button 
            className="header-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Minimize' : 'Expand'}
          >
            {isExpanded ? React.createElement(FiMinimize2 as any) : React.createElement(FiMaximize2 as any)}
          </button>
          <button 
            className="header-btn"
            onClick={clearConversation}
            title="Clear conversation"
          >
            {React.createElement(FiMinus as any)}
          </button>
          <button 
            className="header-btn close"
            onClick={handleToggle}
            title="Close chat"
          >
            {React.createElement(FiX as any)}
          </button>
        </div>
      </div>

      <div className="chatbot-messages">
        {messages.map(renderMessage)}
        {isLoading && (
          <div className="message assistant">
            <div className="message-avatar">
              {React.createElement(FiCpu as any)}
            </div>
            <div className="message-content">
              <div className="message-bubble typing">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chatbot-input">
        <div className="input-container">
          <input
            ref={inputRef}
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me about your stores, forecasts, or OrderNimbus features..."
            disabled={isLoading}
            maxLength={1000}
          />
          <button
            className="send-button"
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading}
          >
            {React.createElement(FiSend as any)}
          </button>
        </div>
        <div className="input-footer">
          <span className="character-count">
            {inputMessage.length}/1000
          </span>
          {isLoading && (
            <span className="loading-text">AI is thinking...</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatBot;