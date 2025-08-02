/**
 * Data Upload Component for OrderNimbus
 * 
 * Features:
 * - CSV file upload with validation
 * - Real-time preview of uploaded data
 * - Integration with secure data storage
 * - Support for sales data, inventory, and forecasting data
 */

import React, { useState, useCallback } from 'react';
import './DataUpload.css';
import toast from 'react-hot-toast';
import { 
  FiUpload, 
  FiFile, 
  FiCheck, 
  FiX, 
  FiDownload,
  FiDatabase,
  FiInfo
} from 'react-icons/fi';
import useSecureData from '../hooks/useSecureData';

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  data?: any[];
}

interface DataPreview {
  headers: string[];
  rows: any[][];
  totalRows: number;
  validationErrors: string[];
}

interface DataUploadProps {
  onDataUploaded?: (data: any[], type: string) => void;
}

const DataUpload: React.FC<DataUploadProps> = ({ onDataUploaded }) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dataPreview, setDataPreview] = useState<DataPreview | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dataType, setDataType] = useState<'sales' | 'inventory' | 'forecast'>('sales');
  
  const { setData, getData, isInitialized } = useSecureData();

  const validateCSVData = (data: any[][], type: string): string[] => {
    const errors: string[] = [];
    
    if (!data || data.length === 0) {
      errors.push('File appears to be empty');
      return errors;
    }

    const headers = data[0];
    
    switch (type) {
      case 'sales':
        const requiredSalesHeaders = ['date', 'store', 'sku', 'quantity', 'revenue'];
        const missingSalesHeaders = requiredSalesHeaders.filter(h => 
          !headers.some(header => header.toLowerCase().includes(h.toLowerCase()))
        );
        if (missingSalesHeaders.length > 0) {
          errors.push(`Missing required columns: ${missingSalesHeaders.join(', ')}`);
        }
        break;
        
      case 'inventory':
        const requiredInventoryHeaders = ['sku', 'store', 'quantity', 'cost'];
        const missingInventoryHeaders = requiredInventoryHeaders.filter(h => 
          !headers.some(header => header.toLowerCase().includes(h.toLowerCase()))
        );
        if (missingInventoryHeaders.length > 0) {
          errors.push(`Missing required columns: ${missingInventoryHeaders.join(', ')}`);
        }
        break;
        
      case 'forecast':
        const requiredForecastHeaders = ['date', 'sku', 'predicted_demand', 'confidence'];
        const missingForecastHeaders = requiredForecastHeaders.filter(h => 
          !headers.some(header => header.toLowerCase().includes(h.toLowerCase()))
        );
        if (missingForecastHeaders.length > 0) {
          errors.push(`Missing required columns: ${missingForecastHeaders.join(', ')}`);
        }
        break;
    }

    if (data.length > 10000) {
      errors.push('File too large (max 10,000 rows). Please split into smaller files.');
    }

    return errors;
  };

  const parseCSV = (csvText: string): any[][] => {
    const lines = csvText.split('\n').filter(line => line.trim());
    return lines.map(line => {
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      
      result.push(current.trim());
      return result;
    });
  };

  const handleFileUpload = useCallback(async (files: FileList) => {
    const file = files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      toast.error('File too large (max 10MB)');
      return;
    }

    setIsProcessing(true);

    try {
      const text = await file.text();
      const data = parseCSV(text);
      
      const validationErrors = validateCSVData(data, dataType);
      
      const preview: DataPreview = {
        headers: data[0] || [],
        rows: data.slice(1, 6), // Show first 5 rows
        totalRows: data.length - 1,
        validationErrors
      };

      setDataPreview(preview);

      const uploadedFile: UploadedFile = {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        data: data
      };

      setUploadedFiles([uploadedFile]);
      
      if (validationErrors.length === 0) {
        toast.success(`Successfully parsed ${data.length - 1} rows`);
      } else {
        toast.error(`Validation errors found: ${validationErrors.length}`);
      }

    } catch (error) {
      console.error('Error parsing CSV:', error);
      toast.error('Error parsing CSV file');
    } finally {
      setIsProcessing(false);
    }
  }, [dataType]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, [handleFileUpload]);

  const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const saveData = async () => {
    if (!dataPreview || !uploadedFiles[0] || dataPreview.validationErrors.length > 0) {
      toast.error('Cannot save data with validation errors');
      return;
    }

    if (!isInitialized) {
      toast.error('Secure storage not initialized');
      return;
    }

    try {
      setIsProcessing(true);
      
      // Get existing data
      const existingData = await getData<any[]>(`${dataType}_data`) || [];
      
      // Process and merge new data
      const newData = uploadedFiles[0].data?.slice(1).map((row: any[], index: number) => {
        const record: any = {
          id: `${dataType}_${Date.now()}_${index}`,
          uploadedAt: new Date().toISOString(),
          source: uploadedFiles[0].name
        };
        
        dataPreview.headers.forEach((header: string, headerIndex: number) => {
          record[header.toLowerCase().replace(/\s+/g, '_')] = row[headerIndex];
        });
        
        return record;
      });

      const combinedData = [...existingData, ...(newData || [])];
      
      // Save to secure storage
      await setData(`${dataType}_data`, combinedData);
      
      // Also save upload history
      const uploadHistory = await getData<any[]>('upload_history') || [];
      uploadHistory.push({
        id: `upload_${Date.now()}`,
        fileName: uploadedFiles[0].name,
        dataType,
        recordsCount: newData?.length || 0,
        uploadedAt: new Date().toISOString(),
        size: uploadedFiles[0].size
      });
      
      await setData('upload_history', uploadHistory);
      
      if (onDataUploaded) {
        onDataUploaded(combinedData, dataType);
      }
      
      toast.success(`Successfully saved ${newData?.length || 0} ${dataType} records`);
      
      // Clear preview
      setDataPreview(null);
      setUploadedFiles([]);
      
    } catch (error) {
      console.error('Error saving data:', error);
      toast.error('Failed to save data');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadTemplate = () => {
    const templates = {
      sales: 'Date,Store,SKU,Product Name,Quantity,Unit Price,Revenue\n2024-01-01,Store 001,SKU001,Product A,10,25.99,259.90',
      inventory: 'SKU,Store,Product Name,Quantity,Unit Cost,Category\nSKU001,Store 001,Product A,100,15.50,Electronics',
      forecast: 'Date,SKU,Product Name,Predicted Demand,Confidence,Lower Bound,Upper Bound\n2024-02-01,SKU001,Product A,150,0.85,120,180'
    };

    const template = templates[dataType];
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataType}_template.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success(`Downloaded ${dataType} template`);
  };

  return (
    <div className="data-upload-container">
      <div className="upload-header">
        <h2>Data Upload</h2>
        <p>Upload CSV files with your sales, inventory, or forecast data</p>
      </div>

      <div className="data-type-selector">
        <label>Data Type:</label>
        <select 
          value={dataType} 
          onChange={(e) => setDataType(e.target.value as any)}
          disabled={uploadedFiles.length > 0}
        >
          <option value="sales">Sales Data</option>
          <option value="inventory">Inventory Data</option>
          <option value="forecast">Forecast Data</option>
        </select>
        <button 
          className="template-button"
          onClick={downloadTemplate}
          title="Download CSV template"
        >
          {React.createElement(FiDownload as any, { size: 16 })}
          Template
        </button>
      </div>

      <div 
        className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".csv"
          onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
          id="file-upload"
          style={{ display: 'none' }}
        />
        
        {uploadedFiles.length === 0 ? (
          <label htmlFor="file-upload" className="upload-label">
            {React.createElement(FiUpload as any, { size: 48 })}
            <h3>Drop CSV file here or click to browse</h3>
            <p>Maximum file size: 10MB</p>
          </label>
        ) : (
          <div className="uploaded-file">
            {React.createElement(FiFile as any, { size: 24 })}
            <div className="file-info">
              <h4>{uploadedFiles[0].name}</h4>
              <p>{(uploadedFiles[0].size / 1024).toFixed(1)} KB</p>
            </div>
            <button 
              onClick={() => {
                setUploadedFiles([]);
                setDataPreview(null);
              }}
              className="remove-file"
            >
              {React.createElement(FiX as any, { size: 20 })}
            </button>
          </div>
        )}
      </div>

      {dataPreview && (
        <div className="data-preview">
          <div className="preview-header">
            <h3>Data Preview</h3>
            <div className="preview-stats">
              <span>{React.createElement(FiDatabase as any, { size: 16 })} {dataPreview.totalRows} total rows</span>
            </div>
          </div>

          {dataPreview.validationErrors.length > 0 && (
            <div className="validation-errors">
              <div className="error-header">
                {React.createElement(FiInfo as any, { size: 16 })}
                <span>Validation Errors:</span>
              </div>
              {dataPreview.validationErrors.map((error, index) => (
                <div key={index} className="error-item">
                  {error}
                </div>
              ))}
            </div>
          )}

          <div className="preview-table">
            <table>
              <thead>
                <tr>
                  {dataPreview.headers.map((header, index) => (
                    <th key={index}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataPreview.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {dataPreview.totalRows > 5 && (
              <div className="preview-note">
                Showing first 5 rows of {dataPreview.totalRows} total rows
              </div>
            )}
          </div>

          <div className="preview-actions">
            <button 
              onClick={saveData}
              disabled={isProcessing || dataPreview.validationErrors.length > 0}
              className="save-button"
            >
              {isProcessing ? (
                <>Processing...</>
              ) : (
                <>
                  {React.createElement(FiCheck as any, { size: 16 })}
                  Save Data
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataUpload;