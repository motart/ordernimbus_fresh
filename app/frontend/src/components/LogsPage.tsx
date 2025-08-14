import React, { useState, useEffect, useRef, useCallback } from 'react';
import './LogsPage.css';
import { getApiUrl } from '../config/environment';
import { authService } from '../services/auth';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import {
  FiRefreshCw,
  FiDownload,
  FiSearch,
  FiPlay,
  FiPause,
  FiTrash2,
  FiClock,
  FiAlertCircle,
  FiInfo,
  FiAlertTriangle,
  FiXCircle
} from 'react-icons/fi';

interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  source: string;
  message: string;
  requestId?: string;
  duration?: number;
  details?: any;
}

interface LogFilter {
  level: string;
  source: string;
  searchText: string;
  startTime?: string;
  endTime?: string;
}

const LogsPage: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<LogFilter>({
    level: 'all',
    source: 'all',
    searchText: ''
  });
  const [sources, setSources] = useState<string[]>([
    'all',
    'store-management',
    'shopify-integration',
    'jwt-authorizer',
    'auth-handler',
    'forecast-api',
    'data-analysis',
    'product-management',
    'order-management',
    'inventory-management',
    'customer-management'
  ]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { user } = useAuth();

  // Fetch logs from API
  const fetchLogs = useCallback(async (since?: string) => {
    if (!user) return;

    try {
      const params = new URLSearchParams();
      if (since) params.append('since', since);
      if (filter.source !== 'all') params.append('source', filter.source);
      if (filter.level !== 'all') params.append('level', filter.level);
      if (filter.startTime) params.append('startTime', filter.startTime);
      if (filter.endTime) params.append('endTime', filter.endTime);

      const response = await authService.authenticatedRequest(
        `/api/logs?${params.toString()}`
      );

      if (response.ok) {
        const data = await response.json();
        return data.logs || [];
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      return [];
    }
  }, [user, filter.source, filter.level, filter.startTime, filter.endTime]);

  // Initial load
  useEffect(() => {
    const loadInitialLogs = async () => {
      setIsLoading(true);
      const initialLogs = await fetchLogs();
      setLogs(initialLogs);
      setIsLoading(false);
    };

    loadInitialLogs();
  }, [fetchLogs]);

  // Polling for new logs
  useEffect(() => {
    if (isStreaming && !isLoading) {
      // Poll every 2 seconds for new logs
      pollingIntervalRef.current = setInterval(async () => {
        const lastTimestamp = logs.length > 0 ? logs[0].timestamp : undefined;
        const newLogs = await fetchLogs(lastTimestamp);
        
        if (newLogs.length > 0) {
          setLogs(prevLogs => [...newLogs, ...prevLogs].slice(0, 1000)); // Keep max 1000 logs
        }
      }, 2000);

      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      };
    }
  }, [isStreaming, isLoading, logs, fetchLogs]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Filter logs based on search text
  const filteredLogs = logs.filter(log => {
    if (filter.searchText) {
      const searchLower = filter.searchText.toLowerCase();
      return (
        log.message.toLowerCase().includes(searchLower) ||
        log.source.toLowerCase().includes(searchLower) ||
        (log.requestId && log.requestId.toLowerCase().includes(searchLower))
      );
    }
    return true;
  });

  // Toggle streaming
  const toggleStreaming = () => {
    setIsStreaming(!isStreaming);
    if (!isStreaming) {
      toast.success('Log streaming resumed');
    } else {
      toast('Log streaming paused');
    }
  };

  // Clear logs
  const clearLogs = () => {
    setLogs([]);
    toast.success('Logs cleared');
  };

  // Export logs
  const exportLogs = () => {
    const logsData = JSON.stringify(filteredLogs, null, 2);
    const blob = new Blob([logsData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ordernimbus-logs-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Logs exported');
  };

  // Refresh logs
  const refreshLogs = async () => {
    setIsLoading(true);
    const freshLogs = await fetchLogs();
    setLogs(freshLogs);
    setIsLoading(false);
    toast.success('Logs refreshed');
  };

  // Get icon for log level
  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'ERROR':
        return React.createElement(FiXCircle as any, { className: "log-icon error" });
      case 'WARN':
        return React.createElement(FiAlertTriangle as any, { className: "log-icon warn" });
      case 'INFO':
        return React.createElement(FiInfo as any, { className: "log-icon info" });
      case 'DEBUG':
        return React.createElement(FiAlertCircle as any, { className: "log-icon debug" });
      default:
        return React.createElement(FiInfo as any, { className: "log-icon" });
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  // Get log level class
  const getLevelClass = (level: string) => {
    return `log-level log-level-${level.toLowerCase()}`;
  };

  return (
    <div className="logs-page">
      <div className="logs-header">
        <h1>Backend Logs</h1>
        <div className="logs-subtitle">
          Real-time logs from Lambda functions and services
        </div>
      </div>

      <div className="logs-controls">
        <div className="logs-filters">
          <select
            value={filter.level}
            onChange={(e) => setFilter({ ...filter, level: e.target.value })}
            className="log-filter-select"
          >
            <option value="all">All Levels</option>
            <option value="ERROR">Errors</option>
            <option value="WARN">Warnings</option>
            <option value="INFO">Info</option>
            <option value="DEBUG">Debug</option>
          </select>

          <select
            value={filter.source}
            onChange={(e) => setFilter({ ...filter, source: e.target.value })}
            className="log-filter-select"
          >
            {sources.map(source => (
              <option key={source} value={source}>
                {source === 'all' ? 'All Sources' : source}
              </option>
            ))}
          </select>

          <div className="log-search">
            {React.createElement(FiSearch as any)}
            <input
              type="text"
              placeholder="Search logs..."
              value={filter.searchText}
              onChange={(e) => setFilter({ ...filter, searchText: e.target.value })}
            />
          </div>
        </div>

        <div className="logs-actions">
          <button
            onClick={toggleStreaming}
            className={`log-btn ${isStreaming ? 'streaming' : ''}`}
            title={isStreaming ? 'Pause streaming' : 'Resume streaming'}
          >
            {isStreaming ? React.createElement(FiPause as any) : React.createElement(FiPlay as any)}
            {isStreaming ? 'Streaming' : 'Paused'}
          </button>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`log-btn ${autoScroll ? 'active' : ''}`}
            title="Auto-scroll to latest"
          >
            Auto-scroll
          </button>

          <button
            onClick={refreshLogs}
            className="log-btn"
            disabled={isLoading}
            title="Refresh logs"
          >
            {React.createElement(FiRefreshCw as any, { className: isLoading ? 'spinning' : '' })}
          </button>

          <button
            onClick={exportLogs}
            className="log-btn"
            title="Export logs"
          >
            {React.createElement(FiDownload as any)}
          </button>

          <button
            onClick={clearLogs}
            className="log-btn"
            title="Clear logs"
          >
            {React.createElement(FiTrash2 as any)}
          </button>
        </div>
      </div>

      <div className="logs-stats">
        <div className="log-stat">
          <span className="stat-label">Total Logs:</span>
          <span className="stat-value">{filteredLogs.length}</span>
        </div>
        <div className="log-stat">
          <span className="stat-label">Errors:</span>
          <span className="stat-value error">
            {filteredLogs.filter(l => l.level === 'ERROR').length}
          </span>
        </div>
        <div className="log-stat">
          <span className="stat-label">Warnings:</span>
          <span className="stat-value warn">
            {filteredLogs.filter(l => l.level === 'WARN').length}
          </span>
        </div>
        <div className="log-stat">
          <span className="stat-label">Status:</span>
          <span className={`stat-value ${isStreaming ? 'streaming' : ''}`}>
            {isStreaming ? '● Live' : '● Paused'}
          </span>
        </div>
      </div>

      <div className="logs-container" ref={logsContainerRef}>
        {isLoading && logs.length === 0 ? (
          <div className="logs-loading">
            {React.createElement(FiRefreshCw as any, { className: "spinning" })}
            <span>Loading logs...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="logs-empty">
            {React.createElement(FiAlertCircle as any)}
            <span>No logs found</span>
          </div>
        ) : (
          <div className="logs-list">
            {filteredLogs.map((log, index) => (
              <div key={`${log.timestamp}-${index}`} className={`log-entry ${log.level.toLowerCase()}`}>
                <div className="log-header">
                  {getLevelIcon(log.level)}
                  <span className="log-timestamp">
                    {React.createElement(FiClock as any)}
                    {formatTimestamp(log.timestamp)}
                  </span>
                  <span className={getLevelClass(log.level)}>
                    {log.level}
                  </span>
                  <span className="log-source">{log.source}</span>
                  {log.requestId && (
                    <span className="log-request-id" title={log.requestId}>
                      {log.requestId.substring(0, 8)}...
                    </span>
                  )}
                  {log.duration && (
                    <span className="log-duration">
                      {log.duration}ms
                    </span>
                  )}
                </div>
                <div className="log-message">{log.message}</div>
                {log.details && (
                  <details className="log-details">
                    <summary>Details</summary>
                    <pre>{JSON.stringify(log.details, null, 2)}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LogsPage;