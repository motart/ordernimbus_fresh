/**
 * Mock Chatbot API for local development
 * 
 * This provides a local implementation of the chatbot functionality
 * that can analyze user data and provide intelligent responses
 * without requiring AWS Bedrock or Lambda deployment
 */

import SecureDataManager from './SecureDataManager';

interface ChatbotRequest {
  message: string;
  conversationId: string;
  userId: string;
  userEmail: string;
  context?: any;
}

interface ChatbotResponse {
  response: string;
  conversationId: string;
  metadata: {
    sources: Array<{ type: string; title: string }>;
    confidence: number;
    processingTime: number;
    tokensUsed: number;
  };
}

class MockDataAnalysisEngine {
  private userId: string;
  private userEmail: string;
  private userData: any = null;

  constructor(userId: string, userEmail: string) {
    this.userId = userId;
    this.userEmail = userEmail;
  }

  async loadUserData() {
    // Load user data from secure storage
    const secureData = SecureDataManager.getInstance();
    
    try {
      const storesData = await secureData.getSecureData('stores');
      const stores = Array.isArray(storesData) ? storesData : this.getDefaultStores();
      const salesData = this.generateRealisticSalesData();
      
      this.userData = {
        stores,
        salesData,
        analytics: this.generateAnalytics(stores, salesData)
      };
      
      return this.userData;
    } catch (error) {
      console.error('Error loading user data:', error);
      return this.getDefaultUserData();
    }
  }

  private getDefaultStores() {
    return [
      {
        id: `${this.userId}_1`,
        name: 'Downtown Flagship Store',
        type: 'brick-and-mortar',
        totalProducts: 1250,
        totalOrders: 3420,
        monthlyRevenue: 275000,
        averageOrderValue: 80.41,
        status: 'active'
      },
      {
        id: `${this.userId}_2`,
        name: 'Online Boutique',
        type: 'shopify',
        totalProducts: 850,
        totalOrders: 2100,
        monthlyRevenue: 168000,
        averageOrderValue: 80.00,
        status: 'active'
      }
    ];
  }

  private getDefaultUserData() {
    const stores = this.getDefaultStores();
    const salesData = this.generateRealisticSalesData();
    
    return {
      stores,
      salesData,
      analytics: this.generateAnalytics(stores, salesData)
    };
  }

  private generateRealisticSalesData() {
    const daily = [];
    const totalRevenue = 443000; // Monthly total
    const avgDaily = Math.round(totalRevenue / 30);
    
    // Generate last 30 days
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const variance = 0.8 + Math.random() * 0.4; // ±20% variance
      const weekendBoost = (date.getDay() === 0 || date.getDay() === 6) ? 1.3 : 1.0;
      
      daily.push({
        date: date.toISOString().split('T')[0],
        revenue: Math.round(avgDaily * variance * weekendBoost),
        orders: Math.round((avgDaily * variance * weekendBoost) / 80),
        customers: Math.round((avgDaily * variance * weekendBoost) / 120)
      });
    }
    
    return {
      daily,
      totalRevenue,
      avgDaily,
      trends: {
        dailyGrowth: 2.1,
        weeklyGrowth: 8.5,
        monthlyGrowth: 12.3
      }
    };
  }

  private generateAnalytics(stores: any[], salesData: any): any {
    const totalMonthlyRevenue = stores.reduce((sum, store) => sum + (store.monthlyRevenue || 0), 0);
    const totalOrders = stores.reduce((sum, store) => sum + (store.totalOrders || 0), 0);
    const avgOrderValue = totalMonthlyRevenue / totalOrders;
    
    return {
      totalRevenue: {
        monthly: totalMonthlyRevenue,
        daily: Math.round(totalMonthlyRevenue / 30),
        annual: totalMonthlyRevenue * 12,
        byStore: stores.map(store => ({
          name: store.name,
          monthly: store.monthlyRevenue,
          percentage: ((store.monthlyRevenue / totalMonthlyRevenue) * 100).toFixed(1)
        }))
      },
      dailyAverage: {
        revenue: Math.round(totalMonthlyRevenue / 30),
        orders: Math.round(totalOrders / 30),
        averageOrderValue: Math.round(avgOrderValue * 100) / 100,
        breakdown: stores.map(store => ({
          name: store.name,
          dailyRevenue: Math.round((store.monthlyRevenue || 0) / 30),
          dailyOrders: Math.round((store.totalOrders || 0) / 30)
        }))
      },
      growthMetrics: {
        monthOverMonth: 8.5,
        quarterOverQuarter: 12.3,
        yearOverYear: 15.7,
        trends: {
          revenue: 'increasing',
          orders: 'increasing',
          averageOrderValue: 'stable'
        }
      },
      performanceMetrics: {
        conversionRate: 2.95,
        customerRetention: 68.5,
        averageOrderValue: Math.round(avgOrderValue * 100) / 100,
        ordersPerDay: Math.round(totalOrders / 30),
        topPerformingStore: stores[0]?.name || 'N/A'
      },
      insights: [
        {
          type: 'positive',
          category: 'revenue',
          message: `Strong daily performance with $${Math.round(totalMonthlyRevenue / 30).toLocaleString()} average daily revenue`
        },
        {
          type: 'positive',
          category: 'growth',
          message: 'Excellent growth momentum with 8.5% month-over-month increase'
        },
        {
          type: 'info',
          category: 'performance',
          message: `${stores[0]?.name || 'Top store'} is your top performer, generating ${stores[0] ? ((stores[0].monthlyRevenue / totalMonthlyRevenue) * 100).toFixed(1) : '0'}% of total revenue`
        }
      ]
    };
  }

  async globalSearch(query: string) {
    if (!this.userData) {
      await this.loadUserData();
    }

    const searchResults = {
      exactMatches: [] as any[],
      relatedData: [] as any[],
      insights: [] as any[]
    };

    const queryLower = query.toLowerCase();
    
    // Search for specific metrics
    if (queryLower.includes('total sales') || queryLower.includes('total revenue')) {
      const totalRevenue = this.userData.analytics.totalRevenue;
      searchResults.exactMatches.push({
        type: 'metric',
        title: 'Total Sales Revenue',
        value: `$${totalRevenue.monthly.toLocaleString()}/month`,
        details: {
          daily: `$${totalRevenue.daily.toLocaleString()}/day`,
          annual: `$${totalRevenue.annual.toLocaleString()}/year`,
          breakdown: totalRevenue.byStore
        }
      });
    }
    
    if (queryLower.includes('daily average') || queryLower.includes('daily sales')) {
      const daily = this.userData.analytics.dailyAverage;
      searchResults.exactMatches.push({
        type: 'metric',
        title: 'Daily Average Performance',
        value: `$${daily.revenue.toLocaleString()} revenue, ${daily.orders} orders`,
        details: {
          averageOrderValue: `$${daily.averageOrderValue}`,
          storeBreakdown: daily.breakdown
        }
      });
    }
    
    if (queryLower.includes('growth') || queryLower.includes('trending')) {
      const growth = this.userData.analytics.growthMetrics;
      searchResults.exactMatches.push({
        type: 'metric',
        title: 'Growth Metrics',
        value: `${growth.monthOverMonth}% month-over-month growth`,
        details: {
          quarterly: `${growth.quarterOverQuarter}% quarter-over-quarter`,
          yearly: `${growth.yearOverYear}% year-over-year`,
          trends: growth.trends
        }
      });
    }
    
    if (queryLower.includes('store') || queryLower.includes('location')) {
      searchResults.relatedData = this.userData.stores.map((store: any) => ({
        type: 'store',
        name: store.name,
        performance: {
          revenue: `$${(store.monthlyRevenue || 0).toLocaleString()}/month`,
          orders: store.totalOrders || 0,
          products: store.totalProducts || 0,
          averageOrderValue: `$${store.averageOrderValue || 0}`
        }
      }));
    }
    
    // Add relevant insights
    searchResults.insights = this.userData.analytics.insights.filter((insight: any) => 
      insight.message.toLowerCase().includes(queryLower) ||
      insight.category.toLowerCase().includes(queryLower)
    );
    
    return searchResults;
  }
}

class MockChatbotAPI {
  private static instance: MockChatbotAPI;
  
  private constructor() {}
  
  static getInstance(): MockChatbotAPI {
    if (!MockChatbotAPI.instance) {
      MockChatbotAPI.instance = new MockChatbotAPI();
    }
    return MockChatbotAPI.instance;
  }

  async processMessage(request: ChatbotRequest): Promise<ChatbotResponse> {
    const startTime = Date.now();
    
    try {
      // Initialize data engine
      const dataEngine = new MockDataAnalysisEngine(request.userId, request.userEmail);
      await dataEngine.loadUserData();
      
      // Perform global search
      const searchResults = await dataEngine.globalSearch(request.message);
      
      // Generate intelligent response
      const response = this.generateIntelligentResponse(request.message, searchResults);
      
      const processingTime = Date.now() - startTime;
      
      return {
        response,
        conversationId: request.conversationId,
        metadata: {
          sources: this.extractSources(searchResults),
          confidence: 0.95,
          processingTime,
          tokensUsed: response.length * 0.75 // Approximate token count
        }
      };
    } catch (error) {
      console.error('Mock chatbot error:', error);
      
      return {
        response: "I apologize, but I encountered an error while analyzing your data. Please try rephrasing your question.",
        conversationId: request.conversationId,
        metadata: {
          sources: [],
          confidence: 0.5,
          processingTime: Date.now() - startTime,
          tokensUsed: 0
        }
      };
    }
  }

  private generateIntelligentResponse(message: string, searchResults: any): string {
    const queryLower = message.toLowerCase();
    
    // Handle specific queries
    if (queryLower.includes('total sales') || queryLower.includes('total revenue')) {
      if (searchResults.exactMatches.length > 0) {
        const match = searchResults.exactMatches[0];
        let response = `Your total sales revenue is **${match.value}**.`;
        
        if (match.details) {
          response += `\n\nHere's the breakdown:\n`;
          response += `• Daily average: ${match.details.daily}\n`;
          response += `• Annual projection: ${match.details.annual}\n`;
          
          if (match.details.breakdown) {
            response += `\n**By store:**\n`;
            match.details.breakdown.forEach((store: any) => {
              response += `• ${store.name}: $${store.monthly.toLocaleString()}/month (${store.percentage}%)\n`;
            });
          }
        }
        
        response += `\n💡 This shows strong performance with consistent revenue growth across your locations.`;
        return response;
      }
    }
    
    if (queryLower.includes('daily average') || queryLower.includes('daily sales')) {
      if (searchResults.exactMatches.length > 0) {
        const match = searchResults.exactMatches[0];
        let response = `Your daily average performance is **${match.value}**.`;
        
        if (match.details?.storeBreakdown) {
          response += `\n\n**Store breakdown:**\n`;
          match.details.storeBreakdown.forEach((store: any) => {
            response += `• ${store.name}: $${store.dailyRevenue.toLocaleString()}/day (${store.dailyOrders} orders)\n`;
          });
        }
        
        response += `\n📊 Your average order value is ${match.details?.averageOrderValue || '$80'}, which is excellent for your market segment.`;
        return response;
      }
    }
    
    if (queryLower.includes('growth') || queryLower.includes('trending')) {
      if (searchResults.exactMatches.length > 0) {
        const match = searchResults.exactMatches[0];
        let response = `Your business is showing excellent growth with **${match.value}**.`;
        
        if (match.details) {
          response += `\n\n**Growth metrics:**\n`;
          response += `• Quarterly: ${match.details.quarterly}\n`;
          response += `• Yearly: ${match.details.yearly}\n`;
          
          if (match.details.trends) {
            response += `\n**Trends:**\n`;
            Object.entries(match.details.trends).forEach(([key, value]) => {
              response += `• ${key}: ${value}\n`;
            });
          }
        }
        
        response += `\n🚀 This growth trajectory indicates strong market position and customer satisfaction!`;
        return response;
      }
    }
    
    if (queryLower.includes('store') || queryLower.includes('location')) {
      if (searchResults.relatedData.length > 0) {
        let response = `Here's your store performance overview:\n\n`;
        
        searchResults.relatedData.forEach((store: any) => {
          response += `**${store.name}**\n`;
          response += `• Revenue: ${store.performance.revenue}\n`;
          response += `• Orders: ${store.performance.orders.toLocaleString()}\n`;
          response += `• Products: ${store.performance.products.toLocaleString()}\n`;
          response += `• Avg Order: ${store.performance.averageOrderValue}\n\n`;
        });
        
        response += `💼 Your multi-location strategy is working well with balanced performance across stores.`;
        return response;
      }
    }
    
    // Add insights if available
    if (searchResults.insights.length > 0) {
      let response = `Based on your business data:\n\n`;
      
      searchResults.insights.forEach((insight: any) => {
        const emoji = insight.type === 'positive' ? '✅' : insight.type === 'opportunity' ? '💡' : 'ℹ️';
        response += `${emoji} ${insight.message}\n`;
      });
      
      return response;
    }
    
    // Generic response with business context
    return `I can help you analyze your business performance! Your business currently operates ${searchResults.relatedData.length || 2} stores with strong revenue performance. 

Ask me about:
• Total sales numbers and revenue breakdown
• Daily averages and performance metrics  
• Growth trends and forecasting
• Individual store performance
• Business insights and recommendations

What specific metrics would you like me to analyze?`;
  }

  private extractSources(searchResults: any): Array<{ type: string; title: string }> {
    const sources = [];
    
    if (searchResults.exactMatches.length > 0) {
      sources.push({ type: 'analytics', title: 'Business Analytics' });
    }
    
    if (searchResults.relatedData.length > 0) {
      sources.push({ type: 'stores', title: 'Store Performance Data' });
    }
    
    if (searchResults.insights.length > 0) {
      sources.push({ type: 'insights', title: 'AI Business Insights' });
    }
    
    return sources;
  }
}

export default MockChatbotAPI;