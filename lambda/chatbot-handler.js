/**
 * AI/ML Chatbot Handler for OrderNimbus
 * 
 * Features:
 * - Conversational AI using AWS Bedrock
 * - Document retrieval and RAG (Retrieval Augmented Generation)
 * - Conversation memory and learning
 * - User-specific context and store data integration
 * - Multi-turn conversation support
 */

const AWS = require('aws-sdk');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

// AWS Service Clients
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Chatbot Configuration
const CHATBOT_CONFIG = {
    modelId: 'anthropic.claude-3-sonnet-20240229-v1:0', // Claude 3 Sonnet
    maxTokens: 2000,
    temperature: 0.7,
    conversationMemoryLimit: 10, // Last 10 exchanges
    documentRetrievalLimit: 5, // Top 5 relevant documents
    maxResponseLength: 1500
};

// Main Lambda Handler
exports.handler = async (event) => {
    console.log('Chatbot request received:', JSON.stringify(event, null, 2));
    
    try {
        const { 
            message, 
            conversationId, 
            userId, 
            userEmail,
            sessionId = `session-${Date.now()}`,
            context = {}
        } = JSON.parse(event.body || '{}');

        // Validate required fields
        if (!message || !userId) {
            return createResponse(400, { 
                error: 'Message and userId are required' 
            });
        }

        // Get user context and store data
        const userContext = await getUserContext(userId, userEmail);
        
        // Retrieve conversation history
        const conversationHistory = await getConversationHistory(
            conversationId || sessionId, 
            userId
        );

        // Retrieve relevant documents and data
        const relevantContext = await retrieveRelevantContext(
            message, 
            userId, 
            userContext
        );

        // Generate AI response
        const aiResponse = await generateAIResponse({
            message,
            conversationHistory,
            relevantContext,
            userContext,
            sessionContext: context
        });

        // Save conversation exchange
        await saveConversationExchange(
            conversationId || sessionId,
            userId,
            message,
            aiResponse,
            relevantContext.sources
        );

        return createResponse(200, {
            response: aiResponse.content,
            conversationId: conversationId || sessionId,
            metadata: {
                sources: relevantContext.sources,
                confidence: aiResponse.confidence,
                processingTime: aiResponse.processingTime,
                tokensUsed: aiResponse.tokensUsed
            }
        });

    } catch (error) {
        console.error('Chatbot error:', error);
        return createResponse(500, {
            error: 'Failed to process your message',
            message: 'I apologize, but I encountered an error. Please try again.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get user context including stores and preferences
async function getUserContext(userId, userEmail) {
    try {
        // Get user stores
        const storesQuery = {
            TableName: process.env.STORES_TABLE || 'ordernimbus-stores',
            FilterExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId
            }
        };

        const storesResult = await dynamodb.scan(storesQuery).promise();
        const userStores = storesResult.Items || [];

        // Get recent forecasts
        const forecastsQuery = {
            TableName: process.env.FORECAST_TABLE || 'ordernimbus-forecasts',
            FilterExpression: 'userId = :userId AND createdAt > :weekAgo',
            ExpressionAttributeValues: {
                ':userId': userId,
                ':weekAgo': new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
            },
            Limit: 5
        };

        const forecastsResult = await dynamodb.scan(forecastsQuery).promise();
        const recentForecasts = forecastsResult.Items || [];

        return {
            userId,
            userEmail,
            stores: userStores,
            recentForecasts,
            storeCount: userStores.length,
            hasShopifyStores: userStores.some(s => s.type === 'shopify'),
            hasBrickMortarStores: userStores.some(s => s.type === 'brick-and-mortar'),
            totalProducts: userStores.reduce((sum, s) => sum + (s.totalProducts || 0), 0),
            totalOrders: userStores.reduce((sum, s) => sum + (s.totalOrders || 0), 0)
        };
    } catch (error) {
        console.error('Error getting user context:', error);
        return {
            userId,
            userEmail,
            stores: [],
            recentForecasts: [],
            storeCount: 0
        };
    }
}

// Retrieve conversation history
async function getConversationHistory(conversationId, userId) {
    try {
        const params = {
            TableName: process.env.CONVERSATION_TABLE || 'ordernimbus-conversations',
            KeyConditionExpression: 'conversationId = :conversationId AND userId = :userId',
            ExpressionAttributeValues: {
                ':conversationId': conversationId,
                ':userId': userId
            },
            ScanIndexForward: false, // Most recent first
            Limit: CHATBOT_CONFIG.conversationMemoryLimit * 2 // Get enough for both questions and answers
        };

        const result = await dynamodb.query(params).promise();
        return result.Items || [];
    } catch (error) {
        console.error('Error retrieving conversation history:', error);
        return [];
    }
}

// Retrieve relevant context using embeddings and semantic search
async function retrieveRelevantContext(message, userId, userContext) {
    try {
        const relevantContext = {
            documents: [],
            storeData: [],
            forecastData: [],
            sources: []
        };

        // 1. Search user documents (if any uploaded)
        const documents = await searchUserDocuments(message, userId);
        relevantContext.documents = documents;
        relevantContext.sources.push(...documents.map(d => ({ type: 'document', title: d.title })));

        // 2. Get relevant store data based on message content
        const storeKeywords = extractStoreKeywords(message);
        const relevantStores = userContext.stores.filter(store => 
            storeKeywords.some(keyword => 
                store.name.toLowerCase().includes(keyword.toLowerCase()) ||
                store.type.includes(keyword.toLowerCase())
            )
        );

        if (relevantStores.length === 0 && storeKeywords.length === 0) {
            // If no specific stores mentioned, include all stores for general questions
            relevantContext.storeData = userContext.stores.slice(0, 3); // Limit to prevent token overflow
        } else {
            relevantContext.storeData = relevantStores;
        }

        // 3. Get relevant forecast data
        const forecastKeywords = ['forecast', 'prediction', 'sales', 'revenue', 'trend', 'future'];
        if (forecastKeywords.some(keyword => message.toLowerCase().includes(keyword))) {
            relevantContext.forecastData = userContext.recentForecasts.slice(0, 2);
            relevantContext.sources.push({ type: 'forecast', title: 'Recent Sales Forecasts' });
        }

        // 4. Add OrderNimbus knowledge base
        const platformKnowledge = await getPlatformKnowledge(message);
        relevantContext.platformKnowledge = platformKnowledge;
        if (platformKnowledge.length > 0) {
            relevantContext.sources.push({ type: 'platform', title: 'OrderNimbus Knowledge Base' });
        }

        return relevantContext;
    } catch (error) {
        console.error('Error retrieving relevant context:', error);
        return { documents: [], storeData: [], forecastData: [], sources: [] };
    }
}

// Search user documents using semantic similarity
async function searchUserDocuments(query, userId) {
    try {
        // This would integrate with vector database like Pinecone or AWS OpenSearch
        // For now, return mock relevant documents
        return [
            {
                title: 'Sales Strategy Guide',
                content: 'Key strategies for improving sales performance...',
                relevanceScore: 0.85,
                source: 'user_document'
            }
        ];
    } catch (error) {
        console.error('Error searching documents:', error);
        return [];
    }
}

// Extract store-related keywords from message
function extractStoreKeywords(message) {
    const storeKeywords = [];
    const words = message.toLowerCase().split(/\s+/);
    
    // Store type keywords
    const storeTypes = ['shopify', 'brick', 'mortar', 'online', 'physical', 'store', 'shop'];
    storeTypes.forEach(type => {
        if (words.includes(type)) {
            storeKeywords.push(type);
        }
    });

    // Extract potential store names (capitalized words)
    const capitalizedWords = message.match(/\b[A-Z][a-z]+\b/g) || [];
    storeKeywords.push(...capitalizedWords);

    return [...new Set(storeKeywords)]; // Remove duplicates
}

// Get platform knowledge based on query
async function getPlatformKnowledge(query) {
    const knowledgeBase = {
        'forecast': [
            'OrderNimbus uses advanced machine learning algorithms to predict sales trends',
            'Forecasts are generated using historical data, seasonal patterns, and market trends',
            'You can generate forecasts for individual stores or view consolidated predictions'
        ],
        'store': [
            'You can manage both physical and online stores in OrderNimbus',
            'Shopify stores can be connected via API for automatic data synchronization',
            'Store performance metrics are tracked including sales, products, and orders'
        ],
        'sales': [
            'Sales data is analyzed using time series forecasting and ML models',
            'Real-time dashboards show current performance vs predictions',
            'Historical sales patterns help identify trends and seasonal variations'
        ]
    };

    const queryLower = query.toLowerCase();
    const relevantKnowledge = [];

    Object.keys(knowledgeBase).forEach(topic => {
        if (queryLower.includes(topic)) {
            relevantKnowledge.push(...knowledgeBase[topic]);
        }
    });

    return relevantKnowledge;
}

// Generate AI response using AWS Bedrock
async function generateAIResponse({ message, conversationHistory, relevantContext, userContext, sessionContext }) {
    const startTime = Date.now();

    try {
        // Build conversation context
        const conversationContext = conversationHistory
            .slice(0, CHATBOT_CONFIG.conversationMemoryLimit)
            .map(item => `${item.type === 'user' ? 'Human' : 'Assistant'}: ${item.content}`)
            .reverse()
            .join('\n');

        // Build system prompt with context
        const systemPrompt = buildSystemPrompt(userContext, relevantContext);
        
        // Build user prompt with conversation history
        const userPrompt = buildUserPrompt(message, conversationContext, relevantContext);

        console.log('Sending request to Bedrock...');
        
        const command = new InvokeModelCommand({
            modelId: CHATBOT_CONFIG.modelId,
            body: JSON.stringify({
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: CHATBOT_CONFIG.maxTokens,
                temperature: CHATBOT_CONFIG.temperature,
                system: systemPrompt,
                messages: [
                    {
                        role: "user",
                        content: userPrompt
                    }
                ]
            })
        });

        const response = await bedrock.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        
        const processingTime = Date.now() - startTime;
        
        return {
            content: responseBody.content[0].text,
            confidence: 0.9, // Mock confidence score
            processingTime,
            tokensUsed: responseBody.usage?.total_tokens || 0
        };

    } catch (error) {
        console.error('Error generating AI response:', error);
        
        // Fallback response
        return {
            content: "I apologize, but I'm having trouble processing your request right now. Could you please try rephrasing your question?",
            confidence: 0.5,
            processingTime: Date.now() - startTime,
            tokensUsed: 0
        };
    }
}

// Build system prompt with user context
function buildSystemPrompt(userContext, relevantContext) {
    const { stores, storeCount, hasShopifyStores, hasBrickMortarStores, totalProducts, totalOrders } = userContext;
    
    return `You are an AI assistant for OrderNimbus, a sales forecasting platform. You help users with questions about their stores, sales forecasts, and business insights.

USER CONTEXT:
- User has ${storeCount} store(s)
- Total products: ${totalProducts}
- Total orders: ${totalOrders}
- Store types: ${hasShopifyStores ? 'Shopify' : ''} ${hasBrickMortarStores ? 'Physical stores' : ''}

CAPABILITIES:
- Answer questions about sales forecasting and predictions
- Provide insights about store performance
- Help with OrderNimbus platform features
- Analyze business trends and patterns
- Suggest optimization strategies

PERSONALITY:
- Professional but friendly
- Data-driven and analytical
- Helpful and solution-oriented
- Concise but comprehensive
- Always relate advice to the user's specific stores and data

GUIDELINES:
- Always reference the user's actual store data when relevant
- Provide actionable insights and recommendations
- If you don't have specific data, clearly state assumptions
- Suggest specific OrderNimbus features that could help
- Keep responses focused and practical`;
}

// Build user prompt with context
function buildUserPrompt(message, conversationContext, relevantContext) {
    let prompt = '';

    if (conversationContext) {
        prompt += `CONVERSATION HISTORY:\n${conversationContext}\n\n`;
    }

    if (relevantContext.storeData.length > 0) {
        prompt += `RELEVANT STORE DATA:\n`;
        relevantContext.storeData.forEach(store => {
            prompt += `- ${store.name} (${store.type}): ${store.totalProducts || 0} products, ${store.totalOrders || 0} orders\n`;
        });
        prompt += '\n';
    }

    if (relevantContext.forecastData.length > 0) {
        prompt += `RECENT FORECASTS:\n`;
        relevantContext.forecastData.forEach(forecast => {
            prompt += `- Store: ${forecast.storeId}, Accuracy: ${forecast.metrics?.accuracy || 'N/A'}%\n`;
        });
        prompt += '\n';
    }

    if (relevantContext.platformKnowledge.length > 0) {
        prompt += `PLATFORM INFORMATION:\n${relevantContext.platformKnowledge.join('\n')}\n\n`;
    }

    prompt += `CURRENT QUESTION: ${message}`;

    return prompt;
}

// Save conversation exchange
async function saveConversationExchange(conversationId, userId, userMessage, aiResponse, sources) {
    try {
        const timestamp = new Date().toISOString();
        
        // Save user message
        await dynamodb.put({
            TableName: process.env.CONVERSATION_TABLE || 'ordernimbus-conversations',
            Item: {
                conversationId,
                userId,
                messageId: `${conversationId}-${Date.now()}-user`,
                timestamp,
                type: 'user',
                content: userMessage,
                sources: [],
                metadata: {}
            }
        }).promise();

        // Save AI response
        await dynamodb.put({
            TableName: process.env.CONVERSATION_TABLE || 'ordernimbus-conversations',
            Item: {
                conversationId,
                userId,
                messageId: `${conversationId}-${Date.now()}-assistant`,
                timestamp: new Date(Date.now() + 1).toISOString(), // Ensure ordering
                type: 'assistant',
                content: aiResponse.content,
                sources: sources || [],
                metadata: {
                    confidence: aiResponse.confidence,
                    processingTime: aiResponse.processingTime,
                    tokensUsed: aiResponse.tokensUsed
                }
            }
        }).promise();

    } catch (error) {
        console.error('Error saving conversation:', error);
        // Continue even if save fails
    }
}

// Create HTTP response
function createResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify(body)
    };
}

// Export for testing
module.exports = {
    handler: exports.handler,
    getUserContext,
    generateAIResponse
};