/**
 * Document Upload Component for AI Chatbot Integration
 * 
 * Allows users to upload documents that the AI chatbot can reference
 * when answering questions about their business
 */

import React, { useState, useCallback } from 'react';
import './DocumentUpload.css';
import toast from 'react-hot-toast';
import { 
  FiUpload, 
  FiFile, 
  FiX, 
  FiCheck,
  FiAlertCircle,
  FiFileText,
  FiFilePlus
} from 'react-icons/fi';
import useSecureData from '../hooks/useSecureData';

interface Document {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: Date;
  content: string;
  summary?: string;
  status: 'processing' | 'ready' | 'error';
}

interface DocumentUploadProps {
  onDocumentsUpdate?: (documents: Document[]) => void;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({ onDocumentsUpdate }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const { 
    isInitialized, 
    getData, 
    setData, 
    userContext 
  } = useSecureData();

  // Load documents on component mount
  React.useEffect(() => {
    if (isInitialized) {
      loadDocuments();
    }
  }, [isInitialized]);

  const loadDocuments = async () => {
    try {
      const savedDocuments = await getData<Document[]>('user_documents');
      if (savedDocuments) {
        setDocuments(savedDocuments);
        if (onDocumentsUpdate) {
          onDocumentsUpdate(savedDocuments);
        }
      }
    } catch (error) {
      console.error('Failed to load documents:', error);
    }
  };

  const saveDocuments = async (updatedDocuments: Document[]) => {
    try {
      await setData('user_documents', updatedDocuments);
      setDocuments(updatedDocuments);
      if (onDocumentsUpdate) {
        onDocumentsUpdate(updatedDocuments);
      }
    } catch (error) {
      console.error('Failed to save documents:', error);
      toast.error('Failed to save documents');
    }
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  };

  const handleFiles = async (files: File[]) => {
    if (!userContext) {
      toast.error('User context not available');
      return;
    }

    // Validate files
    const validFiles = files.filter(file => {
      // Check file type
      const allowedTypes = [
        'text/plain',
        'text/csv',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/json'
      ];

      if (!allowedTypes.includes(file.type)) {
        toast.error(`File type ${file.type} not supported`);
        return false;
      }

      // Check file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`File ${file.name} is too large (max 10MB)`);
        return false;
      }

      return true;
    });

    if (validFiles.length === 0) {
      return;
    }

    setIsUploading(true);

    try {
      const newDocuments: Document[] = [];

      for (const file of validFiles) {
        const content = await readFileContent(file);
        const document: Document = {
          id: `doc-${userContext.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          type: file.type,
          size: file.size,
          uploadedAt: new Date(),
          content,
          status: 'processing'
        };

        newDocuments.push(document);
      }

      // Add to existing documents
      const updatedDocuments = [...documents, ...newDocuments];
      await saveDocuments(updatedDocuments);

      // Process documents (extract summaries, etc.)
      await processDocuments(newDocuments);

      toast.success(`${validFiles.length} document(s) uploaded successfully`);
    } catch (error) {
      console.error('Error uploading documents:', error);
      toast.error('Failed to upload documents');
    } finally {
      setIsUploading(false);
    }
  };

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const content = e.target?.result as string;
        resolve(content);
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      // Read as text for supported formats
      if (file.type.startsWith('text/') || file.type === 'application/json') {
        reader.readAsText(file);
      } else {
        // For other formats, we'd need more sophisticated parsing
        // For now, just store basic info
        resolve(`[${file.type}] ${file.name} - Content parsing not yet implemented`);
      }
    });
  };

  const processDocuments = async (documents: Document[]) => {
    try {
      const processedDocuments = await Promise.all(
        documents.map(async (doc) => {
          // Extract summary and key information
          const summary = extractDocumentSummary(doc.content);
          
          return {
            ...doc,
            summary,
            status: 'ready' as const
          };
        })
      );

      // Update documents with processing results
      const allDocuments = documents.map(original => {
        const processed = processedDocuments.find(p => p.id === original.id);
        return processed || { ...original, status: 'error' as const };
      });

      const updatedDocuments = [
        ...documents.filter(d => !allDocuments.find(ad => ad.id === d.id)),
        ...allDocuments
      ];

      await saveDocuments(updatedDocuments);
    } catch (error) {
      console.error('Error processing documents:', error);
      // Mark documents as ready even if processing fails
      const updatedDocuments = documents.map(doc => ({ ...doc, status: 'ready' as const }));
      await saveDocuments([...documents.filter(d => !updatedDocuments.find(ud => ud.id === d.id)), ...updatedDocuments]);
    }
  };

  const extractDocumentSummary = (content: string): string => {
    // Simple text summarization
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const firstSentences = sentences.slice(0, 3).join('. ');
    return firstSentences.length > 200 
      ? firstSentences.substring(0, 200) + '...'
      : firstSentences;
  };

  const removeDocument = async (documentId: string) => {
    try {
      const updatedDocuments = documents.filter(doc => doc.id !== documentId);
      await saveDocuments(updatedDocuments);
      toast.success('Document removed');
    } catch (error) {
      console.error('Failed to remove document:', error);
      toast.error('Failed to remove document');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) return '📄';
    if (type.includes('word') || type.includes('document')) return '📝';
    if (type.includes('text')) return '📄';
    if (type.includes('csv')) return '📊';
    if (type.includes('json')) return '🔧';
    return '📁';
  };

  const getStatusIcon = (status: Document['status']) => {
    switch (status) {
      case 'processing':
        return <div className="spinner small" />;
      case 'ready':
        return React.createElement(FiCheck as any, { className: "status-icon ready" });
      case 'error':
        return React.createElement(FiAlertCircle as any, { className: "status-icon error" });
    }
  };

  return (
    <div className="document-upload">
      <div className="upload-section">
        <h3>
          <FiFilePlus />
          Document Library
        </h3>
        <p>Upload documents for the AI to reference when answering your questions</p>

        <div 
          className={`upload-area ${dragActive ? 'drag-active' : ''} ${isUploading ? 'uploading' : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="upload-content">
            <FiUpload size={32} />
            <h4>Drop files here or click to upload</h4>
            <p>Supported: TXT, CSV, PDF, DOC, DOCX, JSON (max 10MB each)</p>
            
            <input
              type="file"
              multiple
              accept=".txt,.csv,.pdf,.doc,.docx,.json"
              onChange={handleFileInput}
              style={{ display: 'none' }}
              id="file-input"
            />
            <label htmlFor="file-input" className="upload-button">
              Choose Files
            </label>
          </div>
        </div>

        {isUploading && (
          <div className="upload-progress">
            <div className="spinner" />
            <span>Uploading and processing documents...</span>
          </div>
        )}
      </div>

      {documents.length > 0 && (
        <div className="documents-list">
          <h4>
            <FiFileText />
            Uploaded Documents ({documents.length})
          </h4>
          
          <div className="documents-grid">
            {documents.map((doc) => (
              <div key={doc.id} className="document-card">
                <div className="document-header">
                  <div className="document-icon">
                    {getFileIcon(doc.type)}
                  </div>
                  <div className="document-info">
                    <h5>{doc.name}</h5>
                    <span className="document-size">{formatFileSize(doc.size)}</span>
                  </div>
                  <div className="document-actions">
                    <div className="document-status">
                      {getStatusIcon(doc.status)}
                    </div>
                    <button
                      className="remove-btn"
                      onClick={() => removeDocument(doc.id)}
                      title="Remove document"
                    >
                      <FiX />
                    </button>
                  </div>
                </div>
                
                {doc.summary && (
                  <div className="document-summary">
                    <strong>Summary:</strong> {doc.summary}
                  </div>
                )}
                
                <div className="document-meta">
                  <span>Uploaded: {doc.uploadedAt.toLocaleDateString()}</span>
                  <span className={`status ${doc.status}`}>
                    {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentUpload;