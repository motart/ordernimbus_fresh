/**
 * AI/ML ChatBot Component for OrderNimbus
 * 
 * Features:
 * - Real-time conversational AI
 * - Message history and persistence
 * - Typing indicators and smooth animations
 * - Mobile-responsive design
 * - Integration with user data and context
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
  FiClock,
  FiInfo
} from 'react-icons/fi';
import useSecureData from '../hooks/useSecureData';

interface Message {
  id: string;
  content: string;
  type: 'user' | 'assistant';
  timestamp: Date;
  sources?: Array<{ type: string; title: string }>;
  metadata?: {
    confidence?: number;
    processingTime?: number;
    tokensUsed?: number;
  };
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
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string>('');
  const [showSources, setShowSources] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Secure data management
  const { 
    isInitialized, 
    getData, 
    setData, 
    userContext 
  } = useSecureData();

  // Initialize conversation
  useEffect(() => {
    if (isInitialized && isOpen) {
      initializeConversation();
    }
  }, [isInitialized, isOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Handle visibility changes
  useEffect(() => {
    setIsOpen(isVisible);
  }, [isVisible]);

  const initializeConversation = async () => {
    try {
      // Load conversation history
      const savedMessages = await getData<Message[]>('chatbot_messages');
      const savedConversationId = await getData<string>('chatbot_conversation_id');

      if (savedMessages && savedMessages.length > 0) {
        setMessages(savedMessages);
      } else {
        // Start with welcome message
        const welcomeMessage: Message = {
          id: `welcome-${Date.now()}`,
          content: `Hello! I'm your OrderNimbus AI assistant. I can help you with questions about your stores, sales forecasts, and business insights. What would you like to know?`,
          type: 'assistant',
          timestamp: new Date()
        };
        setMessages([welcomeMessage]);
        await setData('chatbot_messages', [welcomeMessage]);
      }

      if (savedConversationId) {
        setConversationId(savedConversationId);
      } else {
        const newConversationId = `conv-${userContext?.userId}-${Date.now()}`;
        setConversationId(newConversationId);
        await setData('chatbot_conversation_id', newConversationId);
      }
    } catch (error) {
      console.error('Failed to initialize conversation:', error);
    }
  };

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

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading || !userContext) {
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
    setIsTyping(true);

    try {
      // Save message immediately
      await setData('chatbot_messages', updatedMessages);

      // Call chatbot API
      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          conversationId,
          userId: userContext.userId,
          userEmail: userContext.email,
          context: {
            currentPage: window.location.pathname,
            timestamp: new Date().toISOString()
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        content: data.response,
        type: 'assistant',
        timestamp: new Date(),
        sources: data.metadata?.sources || [],
        metadata: data.metadata
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      await setData('chatbot_messages', finalMessages);

    } catch (error) {
      console.error('Chatbot error:', error);
      
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        content: "I apologize, but I'm having trouble connecting right now. Please try again in a moment.",
        type: 'assistant',
        timestamp: new Date()
      };

      const errorMessages = [...updatedMessages, errorMessage];
      setMessages(errorMessages);
      toast.error('Failed to send message');
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearConversation = async () => {
    try {
      setMessages([]);
      await setData('chatbot_messages', []);
      
      // Generate new conversation ID
      const newConversationId = `conv-${userContext?.userId}-${Date.now()}`;
      setConversationId(newConversationId);
      await setData('chatbot_conversation_id', newConversationId);
      
      toast.success('Conversation cleared');
      
      // Re-initialize with welcome message
      await initializeConversation();
    } catch (error) {
      console.error('Failed to clear conversation:', error);
      toast.error('Failed to clear conversation');
    }
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
            {message.content}
          </div>
          {message.sources && message.sources.length > 0 && (
            <div className="message-sources">
              <button 
                className="sources-toggle"
                onClick={() => setShowSources(
                  showSources === message.id ? null : message.id
                )}
              >
                {React.createElement(FiInfo as any, { size: 12 })}
                Sources ({message.sources.length})
              </button>
              {showSources === message.id && (
                <div className="sources-list">
                  {message.sources.map((source, index) => (
                    <div key={index} className="source-item">
                      <span className="source-type">{source.type}</span>
                      <span className="source-title">{source.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="message-timestamp">
          {React.createElement(FiClock as any, { size: 10 })}
          {formatTimestamp(message.timestamp)}
          {message.metadata?.confidence && (
            <span className="confidence">
              {Math.round(message.metadata.confidence * 100)}% confidence
            </span>
          )}
        </div>
      </div>
    </div>
  );

  const renderTypingIndicator = () => (
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
  );

  if (!isOpen) {
    return (
      <div className="chatbot-float-button">
        <button className="chat-toggle" onClick={handleToggle}>
          {React.createElement(FiMessageCircle as any, { size: 24 })}
          <span className="notification-badge">AI</span>
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
        {isTyping && renderTypingIndicator()}
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