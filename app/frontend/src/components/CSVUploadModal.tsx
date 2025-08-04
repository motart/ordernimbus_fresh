import React, { useState, useRef } from 'react';
import { FiUpload, FiX, FiCheck, FiAlertTriangle, FiDownload, FiEye, FiFile, FiDatabase, FiPackage, FiUsers, FiShoppingCart } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { ClipLoader } from 'react-spinners';

interface CSVUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (data: any[], mappedColumns: any, dataType: string) => Promise<void>;
  storeId: string;
  storeName: string;
}

interface ColumnMapping {
  csvColumn: string;
  mappedTo: string;
  confidence: number;
  suggested: boolean;
}

// Data type detection patterns
const DATA_TYPE_PATTERNS = {
  orders: {
    required: ['order', 'customer', 'total', 'price'],
    optional: ['billing', 'shipping', 'payment', 'fulfillment', 'invoice'],
    confidence_threshold: 3
  },
  products: {
    required: ['product', 'sku', 'title', 'price'],
    optional: ['inventory', 'stock', 'category', 'description', 'variant', 'barcode'],
    confidence_threshold: 3
  },
  inventory: {
    required: ['inventory', 'stock', 'quantity', 'sku'],
    optional: ['available', 'reserved', 'location', 'warehouse'],
    confidence_threshold: 3
  },
  customers: {
    required: ['customer', 'email', 'name'],
    optional: ['phone', 'address', 'city', 'country'],
    confidence_threshold: 2
  }
};

// Schema mapping patterns for different data types
const SCHEMA_PATTERNS = {
  orders: {
    'id': ['id', 'order_id', 'order_number', 'orderid', 'order id', 'number'],
    'name': ['name', 'order_name', 'order number', '#', 'order #'],
    'email': ['email', 'customer_email', 'customer email', 'e-mail', 'e_mail'],
    'phone': ['phone', 'customer_phone', 'customer phone', 'telephone', 'mobile'],
    'total_price': ['total', 'total_price', 'total price', 'amount', 'order_total', 'order total', 'grand_total', 'grand total'],
    'currency': ['currency', 'curr', 'currency_code'],
    'financial_status': ['payment_status', 'payment status', 'financial_status', 'financial status', 'status', 'paid'],
    'fulfillment_status': ['fulfillment_status', 'fulfillment status', 'shipping_status', 'shipping status', 'fulfilled'],
    'created_at': ['created_at', 'created at', 'date', 'order_date', 'order date', 'created', 'timestamp'],
    'updated_at': ['updated_at', 'updated at', 'modified', 'last_modified', 'updated'],
    'billing_first_name': ['billing_first_name', 'billing first name', 'first_name', 'first name', 'fname'],
    'billing_last_name': ['billing_last_name', 'billing last name', 'last_name', 'last name', 'lname'],
    'billing_address1': ['billing_address1', 'billing address', 'address', 'billing_address', 'street'],
    'billing_city': ['billing_city', 'city', 'billing city'],
    'billing_province': ['billing_province', 'state', 'province', 'billing_state', 'billing state'],
    'billing_zip': ['billing_zip', 'zip', 'postal', 'zipcode', 'postal_code', 'billing_postal'],
    'billing_country': ['billing_country', 'country', 'billing country'],
    'shipping_first_name': ['shipping_first_name', 'shipping first name', 'ship_first_name'],
    'shipping_last_name': ['shipping_last_name', 'shipping last name', 'ship_last_name'],
    'shipping_address1': ['shipping_address1', 'shipping address', 'shipping_address', 'ship_address'],
    'shipping_city': ['shipping_city', 'shipping city', 'ship_city'],
    'shipping_province': ['shipping_province', 'shipping_state', 'shipping state', 'ship_state'],
    'shipping_zip': ['shipping_zip', 'shipping_postal', 'ship_zip'],
    'shipping_country': ['shipping_country', 'shipping country', 'ship_country'],
    'lineitem_name': ['product', 'product_name', 'product name', 'item', 'item_name', 'lineitem_name'],
    'lineitem_quantity': ['quantity', 'qty', 'lineitem_quantity', 'item_quantity'],
    'lineitem_price': ['price', 'unit_price', 'unit price', 'lineitem_price', 'item_price'],
    'lineitem_sku': ['sku', 'product_code', 'item_code', 'lineitem_sku'],
    'tags': ['tags', 'labels', 'categories'],
    'note': ['note', 'notes', 'comment', 'comments', 'description']
  },
  
  products: {
    'id': ['id', 'product_id', 'sku', 'product id', 'item_id'],
    'title': ['title', 'name', 'product_name', 'product name', 'item_name'],
    'vendor': ['vendor', 'supplier', 'manufacturer', 'brand'],
    'product_type': ['type', 'product_type', 'category', 'product category'],
    'price': ['price', 'cost', 'unit_price', 'retail_price'],
    'sku': ['sku', 'product_code', 'item_code', 'barcode'],
    'inventory_quantity': ['quantity', 'stock', 'inventory', 'available', 'on_hand'],
    'description': ['description', 'details', 'product_description'],
    'tags': ['tags', 'labels', 'keywords'],
    'weight': ['weight', 'product_weight'],
    'compare_at_price': ['compare_at_price', 'original_price', 'msrp']
  },
  
  inventory: {
    'sku': ['sku', 'product_code', 'item_code', 'product_id'],
    'location': ['location', 'warehouse', 'store', 'location_name'],
    'quantity': ['quantity', 'qty', 'stock', 'available'],
    'reserved': ['reserved', 'allocated', 'committed'],
    'available': ['available', 'on_hand', 'in_stock'],
    'incoming': ['incoming', 'on_order', 'inbound'],
    'updated_at': ['updated_at', 'last_updated', 'modified']
  },
  
  customers: {
    'id': ['id', 'customer_id', 'cust_id'],
    'email': ['email', 'customer_email', 'e-mail'],
    'first_name': ['first_name', 'fname', 'firstname'],
    'last_name': ['last_name', 'lname', 'lastname'],
    'phone': ['phone', 'telephone', 'mobile', 'cell'],
    'address': ['address', 'street', 'address1'],
    'city': ['city', 'town'],
    'state': ['state', 'province', 'region'],
    'zip': ['zip', 'postal', 'zipcode', 'postal_code'],
    'country': ['country', 'nation'],
    'tags': ['tags', 'groups', 'segments'],
    'notes': ['notes', 'comments', 'description']
  }
};

const CSVUploadModal: React.FC<CSVUploadModalProps> = ({
  isOpen,
  onClose,
  onUpload,
  storeId,
  storeName
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [detectedDataType, setDetectedDataType] = useState<string>('');
  const [dataTypeConfidence, setDataTypeConfidence] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setFile(null);
    setCsvData([]);
    setCsvHeaders([]);
    setColumnMappings([]);
    setShowPreview(false);
    setValidationErrors([]);
    setDetectedDataType('');
    setDataTypeConfidence(0);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Detect data type from headers
  const detectDataType = (headers: string[]): { type: string; confidence: number } => {
    const scores: { [key: string]: number } = {};
    
    Object.entries(DATA_TYPE_PATTERNS).forEach(([dataType, patterns]) => {
      let score = 0;
      const normalizedHeaders = headers.map(h => h.toLowerCase());
      
      // Check required fields
      patterns.required.forEach(requiredTerm => {
        if (normalizedHeaders.some(h => h.includes(requiredTerm))) {
          score += 2;
        }
      });
      
      // Check optional fields
      patterns.optional.forEach(optionalTerm => {
        if (normalizedHeaders.some(h => h.includes(optionalTerm))) {
          score += 1;
        }
      });
      
      scores[dataType] = score;
    });
    
    // Find the highest scoring data type
    let bestType = 'unknown';
    let highestScore = 0;
    
    Object.entries(scores).forEach(([type, score]) => {
      const threshold = DATA_TYPE_PATTERNS[type as keyof typeof DATA_TYPE_PATTERNS].confidence_threshold;
      if (score >= threshold && score > highestScore) {
        bestType = type;
        highestScore = score;
      }
    });
    
    // Calculate confidence (normalize to 0-1)
    const maxPossibleScore = bestType !== 'unknown' 
      ? (DATA_TYPE_PATTERNS[bestType as keyof typeof DATA_TYPE_PATTERNS].required.length * 2 + 
         DATA_TYPE_PATTERNS[bestType as keyof typeof DATA_TYPE_PATTERNS].optional.length)
      : 10;
    const confidence = highestScore / maxPossibleScore;
    
    return { type: bestType, confidence };
  };

  // Smart column mapping algorithm
  const mapColumns = (headers: string[], dataType: string): ColumnMapping[] => {
    const mappings: ColumnMapping[] = [];
    const schemaPatterns = SCHEMA_PATTERNS[dataType as keyof typeof SCHEMA_PATTERNS] || SCHEMA_PATTERNS.orders;
    
    headers.forEach(header => {
      const normalizedHeader = header.toLowerCase().trim();
      let bestMatch = '';
      let highestConfidence = 0;
      
      // Find best match for this header
      Object.entries(schemaPatterns).forEach(([field, patterns]) => {
        patterns.forEach(pattern => {
          const normalizedPattern = pattern.toLowerCase();
          
          // Exact match gets highest confidence
          if (normalizedHeader === normalizedPattern) {
            if (0.95 > highestConfidence) {
              bestMatch = field;
              highestConfidence = 0.95;
            }
          }
          // Contains match gets medium confidence
          else if (normalizedHeader.includes(normalizedPattern) || normalizedPattern.includes(normalizedHeader)) {
            const confidence = Math.min(0.8, normalizedPattern.length / normalizedHeader.length);
            if (confidence > highestConfidence) {
              bestMatch = field;
              highestConfidence = confidence;
            }
          }
          // Fuzzy match gets lower confidence
          else {
            const similarity = calculateSimilarity(normalizedHeader, normalizedPattern);
            if (similarity > 0.6 && similarity > highestConfidence) {
              bestMatch = field;
              highestConfidence = similarity * 0.7; // Reduce confidence for fuzzy matches
            }
          }
        });
      });
      
      mappings.push({
        csvColumn: header,
        mappedTo: highestConfidence > 0.5 ? bestMatch : 'unmapped',
        confidence: highestConfidence,
        suggested: highestConfidence > 0.7
      });
    });
    
    return mappings;
  };

  // Simple similarity calculation (Levenshtein distance based)
  const calculateSimilarity = (str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  };

  const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  };

  const parseCSV = (text: string): { headers: string[], data: any[] } => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV must have at least a header row and one data row');
    }
    
    // Parse headers
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    // Parse data
    const data = lines.slice(1).map((line, index) => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length !== headers.length) {
        console.warn(`Row ${index + 2} has ${values.length} columns, expected ${headers.length}`);
      }
      
      const row: any = {};
      headers.forEach((header, i) => {
        row[header] = values[i] || '';
      });
      return row;
    });
    
    return { headers, data };
  };

  const validateCSV = (headers: string[], data: any[], dataType: string): string[] => {
    const errors: string[] = [];
    
    // Check if data type could be detected
    if (dataType === 'unknown') {
      errors.push('Unable to determine data type. Please ensure your CSV contains recognizable business data (orders, products, inventory, or customers).');
      return errors;
    }
    
    const mappedFields = columnMappings
      .filter(m => m.mappedTo !== 'unmapped')
      .map(m => m.mappedTo);
    
    // Validate based on data type
    switch (dataType) {
      case 'orders':
        const hasBasicOrderInfo = mappedFields.some(field => 
          ['id', 'name', 'total_price', 'email'].includes(field)
        );
        if (!hasBasicOrderInfo) {
          errors.push('Order data must contain at least one of: Order ID, Order Name, Total Price, or Customer Email');
        }
        break;
        
      case 'products':
        const hasBasicProductInfo = mappedFields.some(field => 
          ['id', 'title', 'sku', 'price'].includes(field)
        );
        if (!hasBasicProductInfo) {
          errors.push('Product data must contain at least one of: Product ID, Title, SKU, or Price');
        }
        break;
        
      case 'inventory':
        const hasBasicInventoryInfo = mappedFields.some(field => 
          ['sku', 'quantity', 'location'].includes(field)
        );
        if (!hasBasicInventoryInfo) {
          errors.push('Inventory data must contain at least one of: SKU, Quantity, or Location');
        }
        break;
        
      case 'customers':
        const hasBasicCustomerInfo = mappedFields.some(field => 
          ['email', 'id', 'first_name', 'last_name'].includes(field)
        );
        if (!hasBasicCustomerInfo) {
          errors.push('Customer data must contain at least one of: Email, Customer ID, or Name');
        }
        break;
    }
    
    // Check if we have any recognizable data
    if (mappedFields.length === 0) {
      errors.push(`No recognizable ${dataType} columns found. Please check your CSV format.`);
    }
    
    // Check data quality
    if (data.length === 0) {
      errors.push('CSV contains no data rows');
    } else if (data.length > 10000) {
      errors.push('CSV contains too many rows (maximum 10,000 rows)');
    }
    
    return errors;
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    
    if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
      toast.error('Please select a CSV file');
      return;
    }
    
    if (selectedFile.size > 10 * 1024 * 1024) { // 10MB limit
      toast.error('File size must be under 10MB');
      return;
    }
    
    setFile(selectedFile);
    setIsProcessing(true);
    
    try {
      const text = await selectedFile.text();
      const { headers, data } = parseCSV(text);
      
      setCsvHeaders(headers);
      setCsvData(data);
      
      // Detect data type
      const { type: detectedType, confidence } = detectDataType(headers);
      setDetectedDataType(detectedType);
      setDataTypeConfidence(confidence);
      
      // Generate smart column mappings based on detected type
      const mappings = mapColumns(headers, detectedType);
      setColumnMappings(mappings);
      
      // Validate the CSV
      const errors = validateCSV(headers, data, detectedType);
      setValidationErrors(errors);
      
      setShowPreview(true);
      
      if (detectedType === 'unknown') {
        toast.error('Unable to determine data type. Please check your CSV format.');
      } else if (errors.length === 0) {
        toast.success(`Successfully parsed ${data.length} ${detectedType} from CSV`);
      } else {
        toast.error(`Found ${errors.length} validation error(s)`);
      }
      
    } catch (error) {
      toast.error(`Error parsing CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
      resetState();
    } finally {
      setIsProcessing(false);
    }
  };

  const updateColumnMapping = (csvColumn: string, newMapping: string) => {
    setColumnMappings(prev => 
      prev.map(mapping => 
        mapping.csvColumn === csvColumn 
          ? { ...mapping, mappedTo: newMapping, suggested: false }
          : mapping
      )
    );
    
    // Re-validate after mapping change
    const errors = validateCSV(csvHeaders, csvData, detectedDataType);
    setValidationErrors(errors);
  };

  const handleUpload = async () => {
    if (validationErrors.length > 0) {
      toast.error('Please fix validation errors before uploading');
      return;
    }
    
    setIsUploading(true);
    
    try {
      const mappingObj: any = {};
      columnMappings.forEach(mapping => {
        if (mapping.mappedTo !== 'unmapped') {
          mappingObj[mapping.csvColumn] = mapping.mappedTo;
        }
      });
      
      await onUpload(csvData, mappingObj, detectedDataType);
      toast.success(`Successfully uploaded ${csvData.length} ${detectedDataType}`);
      handleClose();
    } catch (error) {
      toast.error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const downloadSampleCSV = () => {
    const sampleCSV = `id,name,email,total_price,financial_status,fulfillment_status,created_at,billing_first_name,billing_last_name,billing_address1,billing_city,billing_province,billing_zip,lineitem_name,lineitem_quantity,lineitem_price
1001,#1001,john.doe@example.com,29.99,paid,fulfilled,2025-01-15T10:00:00Z,John,Doe,123 Main St,New York,NY,10001,Widget A,2,14.99
1002,#1002,jane.smith@example.com,45.50,pending,unfulfilled,2025-01-14T15:30:00Z,Jane,Smith,456 Oak Ave,Los Angeles,CA,90210,Widget B,1,45.50
1003,#1003,mike.johnson@example.com,75.25,paid,partial,2025-01-13T09:15:00Z,Mike,Johnson,789 Pine Rd,Chicago,IL,60601,Widget C,3,25.08`;
    
    const blob = new Blob([sampleCSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_orders.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const availableFields = detectedDataType && detectedDataType !== 'unknown' 
    ? Object.keys(SCHEMA_PATTERNS[detectedDataType as keyof typeof SCHEMA_PATTERNS])
    : Object.keys(SCHEMA_PATTERNS.orders);

  // Get icon for data type
  const getDataTypeIcon = (type: string) => {
    switch(type) {
      case 'orders': return React.createElement(FiShoppingCart as any, { size: 16 });
      case 'products': return React.createElement(FiPackage as any, { size: 16 });
      case 'inventory': return React.createElement(FiDatabase as any, { size: 16 });
      case 'customers': return React.createElement(FiUsers as any, { size: 16 });
      default: return React.createElement(FiFile as any, { size: 16 });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="csv-upload-overlay" onClick={handleClose}>
      <div className="csv-upload-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Import Business Data</h2>
          <p>Import data for {storeName}</p>
          <button onClick={handleClose} className="close-button">
            {React.createElement(FiX as any, { size: 20 })}
          </button>
        </div>
        
        <div className="modal-content">
          {!showPreview ? (
            <div className="upload-section">
              <div className="upload-area">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                
                <div 
                  className="upload-zone"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isProcessing ? (
                    <div className="processing-state">
                      <ClipLoader size={40} color="#667eea" />
                      <p>Analyzing your data...</p>
                    </div>
                  ) : (
                    <div className="upload-prompt">
                      {React.createElement(FiUpload as any, { size: 48, color: "#667eea" })}
                      <h3>Select CSV File</h3>
                      <p>Click to browse or drag and drop</p>
                      <button className="select-file-btn">
                        Select File
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="help-section">
                <h4>Supported Data Types:</h4>
                <ul>
                  <li><strong>Orders:</strong> Order ID, Customer Email, Total Price, etc.</li>
                  <li><strong>Products:</strong> SKU, Title, Price, Inventory Quantity</li>
                  <li><strong>Inventory:</strong> SKU, Location, Quantity, Reserved</li>
                  <li><strong>Customers:</strong> Email, Name, Address, Phone</li>
                </ul>
                <p className="auto-detect-note">✨ We'll automatically detect your data type!</p>
                
                <button onClick={downloadSampleCSV} className="sample-btn">
                  {React.createElement(FiDownload as any, { size: 16 })}
                  Download Sample CSV
                </button>
              </div>
            </div>
          ) : (
            <div className="preview-section">
              <div className="preview-header">
                <h3>Review & Map Columns</h3>
                {detectedDataType && detectedDataType !== 'unknown' && (
                  <span className={`data-type-badge ${detectedDataType}`}>
                    {getDataTypeIcon(detectedDataType)}
                    {detectedDataType.toUpperCase()} DATA
                    <span className="confidence-score">
                      ({Math.round(dataTypeConfidence * 100)}% confidence)
                    </span>
                  </span>
                )}
              </div>
              
              {validationErrors.length > 0 && (
                <div className="validation-errors">
                  <h4>{React.createElement(FiAlertTriangle as any, { size: 16 })} Validation Errors:</h4>
                  <ul>
                    {validationErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div className="column-mappings">
                {columnMappings.map((mapping, index) => (
                  <div key={index} className="mapping-row">
                    <div className="csv-column">
                      <strong>{mapping.csvColumn}</strong>
                      {mapping.suggested && (
                        <span className="confidence-badge">
                          {React.createElement(FiCheck as any, { size: 12 })}
                          {Math.round(mapping.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <div className="mapping-arrow">→</div>
                    <div className="mapped-column">
                      <select 
                        value={mapping.mappedTo}
                        onChange={(e) => updateColumnMapping(mapping.csvColumn, e.target.value)}
                        className="mapping-select"
                      >
                        <option value="unmapped">-- Not Mapped --</option>
                        {availableFields.map(field => (
                          <option key={field} value={field}>
                            {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="preview-data">
                <h4>{React.createElement(FiEye as any, { size: 16 })} Preview (First 3 rows)</h4>
                <div className="preview-table">
                  <table>
                    <thead>
                      <tr>
                        {csvHeaders.slice(0, 6).map(header => (
                          <th key={header}>{header}</th>
                        ))}
                        {csvHeaders.length > 6 && <th>...</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {csvData.slice(0, 3).map((row, index) => (
                        <tr key={index}>
                          {csvHeaders.slice(0, 6).map(header => (
                            <td key={header}>{row[header]}</td>
                          ))}
                          {csvHeaders.length > 6 && <td>...</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p>{csvData.length} total {detectedDataType} ready for upload</p>
              </div>
              
              <div className="action-buttons">
                <button onClick={() => setShowPreview(false)} className="back-btn">
                  Back to File Selection
                </button>
                <button 
                  onClick={handleUpload}
                  disabled={validationErrors.length > 0 || isUploading}
                  className="upload-btn"
                >
                  {isUploading ? (
                    <>
                      <ClipLoader size={16} color="white" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      {React.createElement(FiUpload as any, { size: 16 })}
                      Upload {csvData.length} {detectedDataType.charAt(0).toUpperCase() + detectedDataType.slice(1)}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CSVUploadModal;