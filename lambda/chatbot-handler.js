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
const DataAnalysisEngine = require('./data-analysis-engine');

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

// Get comprehensive user context using data analysis engine
async function getUserContext(userId, userEmail) {
    try {
        console.log(`Getting comprehensive user context for: ${userId}`);
        
        // Initialize data analysis engine
        const dataEngine = new DataAnalysisEngine(userId, userEmail);
        const comprehensiveData = await dataEngine.loadUserData();
        
        // Create enhanced user context
        const userContext = {
            userId,
            userEmail,
            stores: comprehensiveData.stores,
            forecasts: comprehensiveData.forecasts,
            salesData: comprehensiveData.salesData,
            orderData: comprehensiveData.orderData,
            productData: comprehensiveData.productData,
            analytics: comprehensiveData.analytics,
            
            // Quick access metrics
            storeCount: comprehensiveData.stores.length,
            hasShopifyStores: comprehensiveData.stores.some(s => s.type === 'shopify'),
            hasBrickMortarStores: comprehensiveData.stores.some(s => s.type === 'brick-and-mortar'),
            totalProducts: comprehensiveData.stores.reduce((sum, s) => sum + (s.totalProducts || 0), 0),
            totalOrders: comprehensiveData.orderData.totalOrders,
            totalRevenue: comprehensiveData.analytics.totalRevenue,
            dailyAverage: comprehensiveData.analytics.dailyAverage,
            growthMetrics: comprehensiveData.analytics.growthMetrics,
            
            // Data search engine
            dataEngine: dataEngine
        };
        
        console.log(`User context loaded: ${userContext.storeCount} stores, $${userContext.totalRevenue.monthly} monthly revenue`);
        return userContext;
    } catch (error) {
        console.error('Error getting user context:', error);
        // Return basic context on error
        return {
            userId,
            userEmail,
            stores: [],
            forecasts: [],
            storeCount: 0,
            totalRevenue: { monthly: 0, daily: 0 },
            dailyAverage: { revenue: 0, orders: 0 }
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

// Retrieve relevant context using global search and data analysis
async function retrieveRelevantContext(message, userId, userContext) {
    try {
        console.log(`Performing global search for query: "${message}"`);
        
        const relevantContext = {
            searchResults: {},
            exactMatches: [],
            relatedData: [],
            calculations: {},
            insights: [],
            documents: [],
            sources: []
        };

        // 1. Perform global data search using the data engine
        if (userContext.dataEngine) {
            relevantContext.searchResults = await userContext.dataEngine.globalSearch(message);
            relevantContext.exactMatches = relevantContext.searchResults.exactMatches || [];
            relevantContext.relatedData = relevantContext.searchResults.relatedData || [];
            relevantContext.calculations = relevantContext.searchResults.calculations || {};
            relevantContext.insights = relevantContext.searchResults.insights || [];
            
            // Add sources for search results
            if (relevantContext.exactMatches.length > 0) {
                relevantContext.sources.push({ type: 'analytics', title: 'Business Analytics' });
            }
            if (relevantContext.relatedData.length > 0) {
                relevantContext.sources.push({ type: 'data', title: 'Store Performance Data' });
            }
        }

        // 2. Add comprehensive analytics if relevant
        const analyticsKeywords = ['analytics', 'performance', 'metrics', 'kpi', 'dashboard'];
        if (analyticsKeywords.some(keyword => message.toLowerCase().includes(keyword))) {
            relevantContext.analytics = userContext.analytics;
            relevantContext.sources.push({ type: 'analytics', title: 'Comprehensive Analytics' });
        }

        // 3. Add sales data if relevant
        const salesKeywords = ['sales', 'revenue', 'income', 'earnings', 'money'];
        if (salesKeywords.some(keyword => message.toLowerCase().includes(keyword))) {
            relevantContext.salesData = userContext.salesData;
            relevantContext.sources.push({ type: 'sales', title: 'Sales Performance Data' });
        }

        // 4. Add store information
        relevantContext.storeData = userContext.stores;
        if (relevantContext.storeData.length > 0) {
            relevantContext.sources.push({ type: 'stores', title: 'Store Information' });
        }

        // 5. Add forecast data if relevant
        const forecastKeywords = ['forecast', 'prediction', 'future', 'projection', 'trend'];
        if (forecastKeywords.some(keyword => message.toLowerCase().includes(keyword))) {
            relevantContext.forecastData = userContext.forecasts;
            relevantContext.sources.push({ type: 'forecast', title: 'Sales Forecasts' });
        }

        // 6. Search user documents (if any uploaded)
        const documents = await searchUserDocuments(message, userId);
        relevantContext.documents = documents;
        relevantContext.sources.push(...documents.map(d => ({ type: 'document', title: d.title })));

        // 7. Add OrderNimbus knowledge base
        const platformKnowledge = await getPlatformKnowledge(message);
        relevantContext.platformKnowledge = platformKnowledge;
        if (platformKnowledge.length > 0) {
            relevantContext.sources.push({ type: 'platform', title: 'OrderNimbus Knowledge Base' });
        }

        console.log(`Context retrieved: ${relevantContext.exactMatches.length} exact matches, ${relevantContext.sources.length} sources`);
        return relevantContext;
    } catch (error) {
        console.error('Error retrieving relevant context:', error);
        return { searchResults: {}, exactMatches: [], relatedData: [], sources: [] };
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

// Build comprehensive user prompt with all available data
function buildUserPrompt(message, conversationContext, relevantContext) {
    let prompt = '';

    if (conversationContext) {
        prompt += `CONVERSATION HISTORY:\n${conversationContext}\n\n`;
    }

    // Add exact matches from global search
    if (relevantContext.exactMatches && relevantContext.exactMatches.length > 0) {
        prompt += `EXACT DATA MATCHES FOR YOUR QUERY:\n`;
        relevantContext.exactMatches.forEach(match => {
            prompt += `- ${match.title}: ${match.value}\n`;
            if (match.details) {
                Object.entries(match.details).forEach(([key, value]) => {
                    if (typeof value === 'object' && Array.isArray(value)) {
                        prompt += `  ${key}: ${value.map(v => typeof v === 'object' ? JSON.stringify(v) : v).join(', ')}\n`;
                    } else {
                        prompt += `  ${key}: ${value}\n`;
                    }
                });
            }
        });
        prompt += '\n';
    }

    // Add store performance data
    if (relevantContext.storeData && relevantContext.storeData.length > 0) {
        prompt += `YOUR STORE PERFORMANCE DATA:\n`;
        relevantContext.storeData.forEach(store => {
            prompt += `- ${store.name} (${store.type}):\n`;
            prompt += `  Monthly Revenue: $${(store.monthlyRevenue || 0).toLocaleString()}\n`;
            prompt += `  Products: ${store.totalProducts || 0}, Orders: ${store.totalOrders || 0}\n`;
            prompt += `  Average Order Value: $${store.averageOrderValue || 0}\n`;
            prompt += `  Performance Rating: ${store.performanceRating || 'N/A'}\n`;
        });
        prompt += '\n';
    }

    // Add sales analytics
    if (relevantContext.salesData) {
        prompt += `SALES PERFORMANCE ANALYTICS:\n`;
        const daily = relevantContext.salesData.daily?.slice(-7) || []; // Last 7 days
        if (daily.length > 0) {
            prompt += `Recent Daily Revenue: ${daily.map(d => `${d.date}: $${d.revenue.toLocaleString()}`).join(', ')}\n`;
        }
        
        if (relevantContext.salesData.trends) {
            prompt += `Growth Trends: Daily ${relevantContext.salesData.trends.dailyGrowth}%, Weekly ${relevantContext.salesData.trends.weeklyGrowth}%, Monthly ${relevantContext.salesData.trends.monthlyGrowth}%\n`;
        }
        prompt += '\n';
    }

    // Add comprehensive analytics
    if (relevantContext.analytics) {
        prompt += `COMPREHENSIVE BUSINESS ANALYTICS:\n`;
        const analytics = relevantContext.analytics;
        
        if (analytics.totalRevenue) {
            prompt += `Total Revenue: $${analytics.totalRevenue.monthly.toLocaleString()}/month ($${analytics.totalRevenue.daily.toLocaleString()}/day)\n`;
        }
        
        if (analytics.dailyAverage) {
            prompt += `Daily Averages: $${analytics.dailyAverage.revenue.toLocaleString()} revenue, ${analytics.dailyAverage.orders} orders\n`;
        }
        
        if (analytics.growthMetrics) {
            prompt += `Growth: ${analytics.growthMetrics.monthOverMonth}% MoM, ${analytics.growthMetrics.yearOverYear}% YoY\n`;
        }
        
        if (analytics.performanceMetrics) {
            const perf = analytics.performanceMetrics;
            prompt += `Performance: ${perf.conversionRate}% conversion, $${perf.averageOrderValue} AOV, ${perf.customerRetention}% retention\n`;
        }
        prompt += '\n';
    }

    // Add insights
    if (relevantContext.insights && relevantContext.insights.length > 0) {
        prompt += `BUSINESS INSIGHTS:\n`;
        relevantContext.insights.forEach(insight => {
            prompt += `- [${insight.type.toUpperCase()}] ${insight.message}\n`;
        });
        prompt += '\n';
    }

    // Add forecast data
    if (relevantContext.forecastData && relevantContext.forecastData.length > 0) {
        prompt += `SALES FORECASTS:\n`;
        relevantContext.forecastData.slice(0, 7).forEach(forecast => { // Next 7 days
            prompt += `- ${forecast.date}: $${forecast.predictedRevenue?.toLocaleString() || 'N/A'} (${forecast.confidence || 'N/A'}% confidence)\n`;
        });
        prompt += '\n';
    }

    // Add platform knowledge
    if (relevantContext.platformKnowledge && relevantContext.platformKnowledge.length > 0) {
        prompt += `ORDERNIMBUS PLATFORM INFO:\n${relevantContext.platformKnowledge.join('\n')}\n\n`;
    }

    // Add related data
    if (relevantContext.relatedData && relevantContext.relatedData.length > 0) {
        prompt += `RELATED DATA:\n`;
        relevantContext.relatedData.forEach(data => {
            prompt += `- ${data.type}: ${data.name || 'N/A'}\n`;
            if (data.performance) {
                Object.entries(data.performance).forEach(([key, value]) => {
                    prompt += `  ${key}: ${value}\n`;
                });
            }
        });
        prompt += '\n';
    }

    prompt += `USER QUESTION: ${message}\n\n`;
    prompt += `INSTRUCTIONS: Answer the user's question using the comprehensive data provided above. Be specific with numbers and provide actionable insights. If asked about totals, averages, or specific metrics, provide exact figures from the data.`;

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