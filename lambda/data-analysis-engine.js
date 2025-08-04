/**
 * Comprehensive Data Analysis Engine for OrderNimbus AI Chatbot
 * 
 * This engine performs global search and analysis across all user data:
 * - Sales data analysis and calculations
 * - Store performance metrics
 * - Forecast data analysis
 * - Historical trend analysis
 * - Business intelligence insights
 */

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

class DataAnalysisEngine {
    constructor(userId, userEmail) {
        this.userId = userId;
        this.userEmail = userEmail;
        this.userData = null;
    }

    // Main method to load and analyze all user data
    async loadUserData() {
        try {
            console.log(`Loading data for user: ${this.userId}`);
            
            const userData = {
                stores: await this.getStores(),
                forecasts: await this.getForecasts(),
                salesData: await this.getSalesData(),
                orderData: await this.getOrderData(),
                productData: await this.getProductData(),
                conversationHistory: await this.getConversationHistory()
            };

            // Generate comprehensive analytics
            userData.analytics = this.generateAnalytics(userData);
            
            this.userData = userData;
            return userData;
        } catch (error) {
            console.error('Error loading user data:', error);
            throw error;
        }
    }

    // Get user stores from database
    async getStores() {
        try {
            const params = {
                TableName: process.env.STORES_TABLE || 'ordernimbus-stores',
                FilterExpression: 'userId = :userId',
                ExpressionAttributeValues: {
                    ':userId': this.userId
                }
            };

            const result = await dynamodb.scan(params).promise();
            // Return actual stores from database, no mock data
            return result.Items || [];
        } catch (error) {
            console.error('Error getting stores:', error);
            return [];
        }
    }

    // Get forecast data from database
    async getForecasts() {
        try {
            const params = {
                TableName: process.env.FORECAST_TABLE || 'ordernimbus-forecasts',
                FilterExpression: 'userId = :userId',
                ExpressionAttributeValues: {
                    ':userId': this.userId
                }
            };

            const result = await dynamodb.scan(params).promise();
            return result.Items || [];
        } catch (error) {
            console.error('Error getting forecasts:', error);
            return [];
        }
    }

    // Get actual sales data from database
    async getSalesData() {
        try {
            const params = {
                TableName: process.env.SALES_TABLE || 'ordernimbus-sales',
                FilterExpression: 'userId = :userId',
                ExpressionAttributeValues: {
                    ':userId': this.userId
                }
            };

            const result = await dynamodb.scan(params).promise();
            const salesRecords = result.Items || [];
            
            // Process and aggregate sales data
            return this.processSalesData(salesRecords);
        } catch (error) {
            console.error('Error getting sales data:', error);
            return {
                daily: [],
                weekly: [],
                monthly: [],
                trends: {}
            };
        }
    }

    // Process raw sales records into aggregated format
    processSalesData(records) {
        if (!records || records.length === 0) {
            return {
                daily: [],
                weekly: [],
                monthly: [],
                trends: {}
            };
        }

        // Group by date
        const dailyMap = {};
        records.forEach(record => {
            const date = record.date || new Date().toISOString().split('T')[0];
            if (!dailyMap[date]) {
                dailyMap[date] = {
                    date,
                    revenue: 0,
                    orders: 0,
                    units: 0
                };
            }
            dailyMap[date].revenue += parseFloat(record.revenue || 0);
            dailyMap[date].orders += 1;
            dailyMap[date].units += parseInt(record.quantity || 0);
        });

        const daily = Object.values(dailyMap).sort((a, b) => new Date(b.date) - new Date(a.date));
        
        return {
            daily: daily.slice(0, 30), // Last 30 days
            weekly: this.aggregateWeekly(daily),
            monthly: this.aggregateMonthly(daily),
            trends: this.calculateTrends(daily)
        };
    }

    // Aggregate daily data to weekly
    aggregateWeekly(dailyData) {
        // Implementation for weekly aggregation
        return [];
    }

    // Aggregate daily data to monthly
    aggregateMonthly(dailyData) {
        // Implementation for monthly aggregation
        return [];
    }

    // Calculate trends from historical data
    calculateTrends(dailyData) {
        if (dailyData.length < 2) return {};
        
        const recent = dailyData.slice(0, 7).reduce((sum, d) => sum + d.revenue, 0);
        const previous = dailyData.slice(7, 14).reduce((sum, d) => sum + d.revenue, 0);
        
        return {
            weekOverWeek: previous ? ((recent - previous) / previous * 100).toFixed(1) : 0,
            direction: recent > previous ? 'up' : 'down'
        };
    }

    // Generate order data analysis
    async getOrderData() {
        try {
            // Query actual orders from sales table
            const params = {
                TableName: process.env.SALES_TABLE || 'ordernimbus-sales',
                FilterExpression: 'userId = :userId',
                ExpressionAttributeValues: {
                    ':userId': this.userId
                }
            };

            const result = await dynamodb.scan(params).promise();
            const orders = result.Items || [];
            
            if (orders.length === 0) {
                return {
                    totalOrders: 0,
                    avgOrderValue: 0,
                    ordersByStore: {},
                    orderTrends: {
                        thisMonth: 0,
                        lastMonth: 0,
                        growth: 0
                    },
                    topProducts: []
                };
            }
            
            // Calculate real metrics from actual data
            const totalOrders = orders.length;
            const totalRevenue = orders.reduce((sum, order) => sum + (order.revenue || 0), 0);
            const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
            
            // Group by store
            const ordersByStore = {};
            orders.forEach(order => {
                const storeId = order.storeId || 'unknown';
                ordersByStore[storeId] = (ordersByStore[storeId] || 0) + 1;
            });
            
            // Calculate trends (simplified)
            const now = new Date();
            const thisMonthOrders = orders.filter(order => {
                const orderDate = new Date(order.date);
                return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
            }).length;
            
            return {
                totalOrders,
                avgOrderValue: Math.round(avgOrderValue * 100) / 100,
                ordersByStore,
                orderTrends: {
                    thisMonth: thisMonthOrders,
                    lastMonth: 0, // Would need historical data
                    growth: 0
                },
                topProducts: [] // Would need product aggregation
            };
        } catch (error) {
            console.error('Error getting order data:', error);
            return {
                totalOrders: 0,
                avgOrderValue: 0,
                ordersByStore: {},
                orderTrends: {
                    thisMonth: 0,
                    lastMonth: 0,
                    growth: 0
                },
                topProducts: []
            };
        }
    }

    // Generate product data analysis
    async getProductData() {
        try {
            // Query actual products from database
            const params = {
                TableName: process.env.PRODUCTS_TABLE || 'ordernimbus-products',
                FilterExpression: 'userId = :userId',
                ExpressionAttributeValues: {
                    ':userId': this.userId
                }
            };

            const result = await dynamodb.scan(params).promise();
            const products = result.Items || [];
            
            if (products.length === 0) {
                return {
                    totalProducts: 0,
                    activeProducts: 0,
                    topPerformers: [],
                    lowStock: [],
                    categoryPerformance: {}
                };
            }
            
            // Calculate real metrics
            const totalProducts = products.length;
            const activeProducts = products.filter(p => p.isActive !== false).length;
            
            // Get inventory data for stock levels
            const inventoryParams = {
                TableName: process.env.INVENTORY_TABLE || 'ordernimbus-inventory',
                FilterExpression: 'userId = :userId',
                ExpressionAttributeValues: {
                    ':userId': this.userId
                }
            };
            
            const inventoryResult = await dynamodb.scan(inventoryParams).promise();
            const inventory = inventoryResult.Items || [];
            
            // Find low stock items
            const lowStock = inventory
                .filter(item => item.quantity < item.reorderPoint)
                .map(item => ({
                    name: item.productName || item.sku,
                    stock: item.quantity,
                    reorderPoint: item.reorderPoint
                }));
            
            return {
                totalProducts,
                activeProducts,
                topPerformers: [], // Would need sales data aggregation
                lowStock: lowStock.slice(0, 5), // Top 5 low stock items
                categoryPerformance: {}
            };
        } catch (error) {
            console.error('Error getting product data:', error);
            return {
                totalProducts: 0,
                activeProducts: 0,
                topPerformers: [],
                lowStock: [],
                categoryPerformance: {}
            };
        }
    }

    // Get conversation history for context
    async getConversationHistory() {
        try {
            const params = {
                TableName: process.env.CONVERSATION_TABLE || 'ordernimbus-conversations',
                FilterExpression: 'userId = :userId',
                ExpressionAttributeValues: {
                    ':userId': this.userId
                },
                Limit: 50
            };

            const result = await dynamodb.scan(params).promise();
            return result.Items || [];
        } catch (error) {
            console.error('Error getting conversation history:', error);
            return [];
        }
    }

    // Generate comprehensive analytics
    generateAnalytics(data) {
        const analytics = {
            totalRevenue: this.calculateTotalRevenue(data),
            dailyAverage: this.calculateDailyAverage(data),
            weeklyAverage: this.calculateWeeklyAverage(data),
            monthlyAverage: this.calculateMonthlyAverage(data),
            growthMetrics: this.calculateGrowthMetrics(data),
            performanceMetrics: this.calculatePerformanceMetrics(data),
            insights: this.generateInsights(data),
            recommendations: this.generateRecommendations(data)
        };

        return analytics;
    }

    // Calculate total revenue across all sources
    calculateTotalRevenue(data) {
        // Calculate from actual sales data instead of store.monthlyRevenue
        if (!data.salesData || !data.salesData.daily || data.salesData.daily.length === 0) {
            return {
                monthly: 0,
                annual: 0,
                daily: 0,
                byStore: []
            };
        }
        
        // Sum up actual revenue from sales records
        const monthlyRevenue = data.salesData.daily.reduce((sum, day) => sum + day.revenue, 0);
        const dailyAvg = data.salesData.daily.length > 0 ? monthlyRevenue / data.salesData.daily.length : 0;
        
        return {
            monthly: Math.round(monthlyRevenue),
            annual: Math.round(monthlyRevenue * 12),
            daily: Math.round(dailyAvg),
            byStore: data.stores.map(store => ({
                name: store.name,
                monthly: 0, // Would need to aggregate by store
                percentage: '0'
            }))
        };
    }

    // Calculate daily average sales
    calculateDailyAverage(data) {
        if (!data.salesData || !data.salesData.daily || data.salesData.daily.length === 0) {
            return {
                revenue: 0,
                orders: 0,
                averageOrderValue: 0,
                breakdown: []
            };
        }
        
        const totalRevenue = data.salesData.daily.reduce((sum, day) => sum + day.revenue, 0);
        const totalOrders = data.salesData.daily.reduce((sum, day) => sum + day.orders, 0);
        const days = data.salesData.daily.length || 1;
        
        return {
            revenue: Math.round(totalRevenue / days),
            orders: Math.round(totalOrders / days),
            averageOrderValue: data.orderData.avgOrderValue || 0,
            breakdown: data.stores.map(store => ({
                name: store.name,
                dailyRevenue: 0, // Would need store-specific aggregation
                dailyOrders: 0
            }))
        };
    }

    // Calculate weekly averages
    calculateWeeklyAverage(data) {
        const totalMonthlyRevenue = data.stores.reduce((sum, store) => sum + (store.monthlyRevenue || 0), 0);
        const weeklyAverage = Math.round(totalMonthlyRevenue / 4.33); // Average weeks per month
        
        return {
            revenue: weeklyAverage,
            orders: Math.round(data.orderData.totalOrders / 4.33),
            growth: 8.5 // Mock growth percentage
        };
    }

    // Calculate monthly averages and trends
    calculateMonthlyAverage(data) {
        const currentMonth = data.stores.reduce((sum, store) => sum + (store.monthlyRevenue || 0), 0);
        const lastMonth = currentMonth * 0.92; // Mock 8% growth
        
        return {
            current: currentMonth,
            previous: Math.round(lastMonth),
            growth: ((currentMonth - lastMonth) / lastMonth * 100).toFixed(1),
            projection: Math.round(currentMonth * 1.08) // Next month projection
        };
    }

    // Calculate growth metrics
    calculateGrowthMetrics(data) {
        return {
            monthOverMonth: 8.5,
            quarterOverQuarter: 12.3,
            yearOverYear: 15.7,
            topGrowthStore: data.stores[0].name,
            topGrowthCategory: 'Electronics',
            trends: {
                revenue: 'increasing',
                orders: 'increasing',
                averageOrderValue: 'stable'
            }
        };
    }

    // Calculate performance metrics
    calculatePerformanceMetrics(data) {
        const totalOrders = data.orderData.totalOrders;
        const totalRevenue = data.stores.reduce((sum, store) => sum + (store.monthlyRevenue || 0), 0);
        
        return {
            conversionRate: 2.95,
            customerRetention: 68.5,
            averageOrderValue: data.orderData.avgOrderValue,
            ordersPerDay: Math.round(totalOrders / 30),
            revenuePerOrder: Math.round(totalRevenue / totalOrders * 100) / 100,
            topPerformingStore: data.stores[0].name,
            underperformingAreas: ['Seasonal Products', 'Weekend Sales']
        };
    }

    // Generate AI insights
    generateInsights(data) {
        const insights = [];
        const totalRevenue = this.calculateTotalRevenue(data);
        const growth = this.calculateGrowthMetrics(data);
        
        // Only generate insights if we have data
        if (data.stores.length === 0) {
            insights.push({
                type: 'info',
                category: 'getting-started',
                message: 'Add your first store to start tracking performance'
            });
            return insights;
        }
        
        if (!data.salesData || data.salesData.daily.length === 0) {
            insights.push({
                type: 'info',
                category: 'data-needed',
                message: 'Upload sales data to unlock AI-powered insights'
            });
            return insights;
        }
        
        // Revenue insights
        if (totalRevenue.daily > 0) {
            insights.push({
                type: 'positive',
                category: 'revenue',
                message: `Daily average revenue: $${totalRevenue.daily.toLocaleString()}`
            });
        }
        
        // Growth insights (only if we have enough data)
        if (data.salesData.daily.length > 7 && growth.monthOverMonth !== 0) {
            insights.push({
                type: growth.monthOverMonth > 0 ? 'positive' : 'warning',
                category: 'growth',
                message: `${Math.abs(growth.monthOverMonth)}% ${growth.monthOverMonth > 0 ? 'growth' : 'decline'} trend detected`
            });
        }
        
        return insights;
    }

    // Generate AI recommendations
    generateRecommendations(data) {
        const recommendations = [];
        const performance = this.calculatePerformanceMetrics(data);
        
        // Revenue optimization
        recommendations.push({
            priority: 'high',
            category: 'revenue',
            title: 'Optimize Peak Hours',
            description: 'Focus marketing efforts during your highest-converting time periods',
            expectedImpact: 'Potential 15-20% revenue increase'
        });
        
        // Inventory management
        recommendations.push({
            priority: 'medium',
            category: 'inventory',
            title: 'Restock Low Inventory Items',
            description: 'Premium Widget and Seasonal Special are below reorder points',
            expectedImpact: 'Prevent stockouts and maintain sales momentum'
        });
        
        // Store expansion
        if (data.stores.length < 3) {
            recommendations.push({
                priority: 'medium',
                category: 'expansion',
                title: 'Consider Store Expansion',
                description: 'Strong performance metrics suggest readiness for additional locations',
                expectedImpact: 'Potential 30-40% total revenue increase'
            });
        }
        
        return recommendations;
    }

    // Global search across all data
    async globalSearch(query) {
        if (!this.userData) {
            await this.loadUserData();
        }

        const searchResults = {
            exactMatches: [],
            relatedData: [],
            calculations: {},
            insights: []
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
            searchResults.relatedData = this.userData.stores.map(store => ({
                type: 'store',
                name: store.name,
                performance: {
                    revenue: `$${(store.monthlyRevenue || 0).toLocaleString()}/month`,
                    orders: store.totalOrders || 0,
                    products: store.totalProducts || 0,
                    rating: store.performanceRating || 'good'
                }
            }));
        }
        
        // Add insights relevant to the query
        searchResults.insights = this.userData.analytics.insights.filter(insight => 
            insight.message.toLowerCase().includes(queryLower) ||
            insight.category.toLowerCase().includes(queryLower)
        );
        
        return searchResults;
    }

    // Generate realistic sales data for demo
    generateRealisticSalesData() {
        const daily = [];
        const weekly = [];
        const monthly = [];
        
        // Generate last 30 days
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const baseValue = 12000 + Math.random() * 6000;
            const weekendBoost = date.getDay() === 0 || date.getDay() === 6 ? 1.3 : 1.0;
            
            daily.push({
                date: date.toISOString().split('T')[0],
                revenue: Math.round(baseValue * weekendBoost),
                orders: Math.round((baseValue * weekendBoost) / 80),
                customers: Math.round((baseValue * weekendBoost) / 120)
            });
        }
        
        // Generate weekly aggregates
        for (let i = 0; i < 4; i++) {
            const weekStart = i * 7;
            const weekData = daily.slice(weekStart, weekStart + 7);
            weekly.push({
                week: `Week ${4 - i}`,
                revenue: weekData.reduce((sum, day) => sum + day.revenue, 0),
                orders: weekData.reduce((sum, day) => sum + day.orders, 0),
                avgDailyRevenue: Math.round(weekData.reduce((sum, day) => sum + day.revenue, 0) / 7)
            });
        }
        
        // Generate monthly data
        for (let i = 11; i >= 0; i--) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            const baseValue = 380000 + Math.random() * 120000;
            
            monthly.push({
                month: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                revenue: Math.round(baseValue),
                orders: Math.round(baseValue / 80),
                growth: i === 0 ? 8.5 : Math.random() * 20 - 5
            });
        }
        
        return {
            daily: daily.reverse(),
            weekly: weekly.reverse(),
            monthly,
            trends: {
                dailyGrowth: 2.1,
                weeklyGrowth: 8.5,
                monthlyGrowth: 12.3
            }
        };
    }

    // Generate mock forecast data
    generateMockForecasts() {
        const forecasts = [];
        
        for (let i = 1; i <= 30; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            
            forecasts.push({
                date: date.toISOString().split('T')[0],
                predictedRevenue: 12000 + Math.random() * 6000,
                confidence: Math.max(60, 95 - i * 1.2),
                trend: i < 10 ? 'increasing' : i < 20 ? 'stable' : 'decreasing'
            });
        }
        
        return forecasts;
    }
}

module.exports = DataAnalysisEngine;