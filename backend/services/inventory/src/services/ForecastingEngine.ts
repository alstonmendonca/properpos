// Enhanced forecasting engine for inventory demand prediction

export interface DailySalesPoint {
  date: string;
  quantity: number;
  revenue: number;
}

export interface ForecastResult {
  predictedDemand: number;
  recommendedOrder: number;
  confidence: number;
  confidenceInterval70: { lower: number; upper: number };
  confidenceInterval90: { lower: number; upper: number };
  trend: 'increasing' | 'decreasing' | 'stable';
  trendStrength: number;
  seasonality: boolean;
  seasonalPattern?: number[];
  daysUntilStockout: number | null;
  method: string;
}

export interface ReorderSuggestion {
  productId: string;
  productName: string;
  locationId: string;
  currentStock: number;
  predictedDemand: number;
  daysUntilStockout: number | null;
  suggestedOrderQuantity: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  estimatedOrderDate: Date;
  confidence: number;
}

export class ForecastingEngine {
  /**
   * Weighted Moving Average forecast.
   * Assigns linearly increasing weights (oldest=1, newest=n).
   */
  weightedMovingAverage(dailySales: DailySalesPoint[], forecastPeriod: number): ForecastResult {
    if (dailySales.length < 2) {
      return this.emptyForecast('weighted_moving_average', forecastPeriod);
    }

    const quantities = dailySales.map(d => d.quantity);
    const n = quantities.length;

    // Linearly increasing weights: oldest=1, newest=n
    const weights: number[] = [];
    let totalWeight = 0;
    for (let i = 0; i < n; i++) {
      const w = i + 1;
      weights.push(w);
      totalWeight += w;
    }

    // Calculate weighted average daily demand
    let weightedSum = 0;
    for (let i = 0; i < n; i++) {
      weightedSum += quantities[i] * weights[i];
    }
    const weightedAvgDaily = weightedSum / totalWeight;

    // Detect trend
    const { direction: trend, strength: trendStrength } = this.detectTrend(quantities);

    // Apply trend multiplier (up to 30% adjustment)
    let trendMultiplier = 1;
    if (trend === 'increasing') {
      trendMultiplier = 1 + Math.min(trendStrength, 0.3);
    } else if (trend === 'decreasing') {
      trendMultiplier = 1 - Math.min(trendStrength, 0.3);
    }

    const predictedDemand = Math.round(weightedAvgDaily * forecastPeriod * trendMultiplier);

    // Confidence intervals
    const stdDev = this.standardDeviation(quantities);
    const mean = quantities.reduce((a, b) => a + b, 0) / n;
    const confidence = this.calculateConfidence(n, stdDev, mean);

    const ci70 = this.confidenceInterval(predictedDemand, stdDev, forecastPeriod, 1.04);
    const ci90 = this.confidenceInterval(predictedDemand, stdDev, forecastPeriod, 1.645);

    // Seasonality detection
    const { seasonal, pattern } = this.detectSeasonality(dailySales);

    // Recommended order with 20% safety stock
    const recommendedOrder = Math.ceil(predictedDemand * 1.2);

    return {
      predictedDemand,
      recommendedOrder,
      confidence,
      confidenceInterval70: ci70,
      confidenceInterval90: ci90,
      trend,
      trendStrength,
      seasonality: seasonal,
      seasonalPattern: seasonal ? pattern : undefined,
      daysUntilStockout: null,
      method: 'weighted_moving_average',
    };
  }

  /**
   * Holt's double exponential smoothing forecast.
   */
  exponentialSmoothing(
    dailySales: DailySalesPoint[],
    forecastPeriod: number,
    alpha: number = 0.3,
    beta: number = 0.1
  ): ForecastResult {
    if (dailySales.length < 2) {
      return this.emptyForecast('exponential_smoothing', forecastPeriod);
    }

    const quantities = dailySales.map(d => d.quantity);
    const n = quantities.length;

    // Initialize level and trend
    let level = quantities[0];
    let trendComponent = quantities[1] - quantities[0];

    // Loop through all data points updating level and trend
    for (let i = 1; i < n; i++) {
      const prevLevel = level;
      level = alpha * quantities[i] + (1 - alpha) * (prevLevel + trendComponent);
      trendComponent = beta * (level - prevLevel) + (1 - beta) * trendComponent;
    }

    // Forecast = sum of (level + k * trend) for k = 1..period
    let predictedDemand = 0;
    for (let k = 1; k <= forecastPeriod; k++) {
      predictedDemand += level + k * trendComponent;
    }
    predictedDemand = Math.max(0, Math.round(predictedDemand));

    // Detect trend from data
    const { direction: trend, strength: trendStrength } = this.detectTrend(quantities);

    // Confidence intervals
    const stdDev = this.standardDeviation(quantities);
    const mean = quantities.reduce((a, b) => a + b, 0) / n;
    const confidence = this.calculateConfidence(n, stdDev, mean);

    const ci70 = this.confidenceInterval(predictedDemand, stdDev, forecastPeriod, 1.04);
    const ci90 = this.confidenceInterval(predictedDemand, stdDev, forecastPeriod, 1.645);

    // Seasonality detection
    const { seasonal, pattern } = this.detectSeasonality(dailySales);

    // Recommended order with 20% safety stock
    const recommendedOrder = Math.ceil(predictedDemand * 1.2);

    return {
      predictedDemand,
      recommendedOrder,
      confidence,
      confidenceInterval70: ci70,
      confidenceInterval90: ci90,
      trend,
      trendStrength,
      seasonality: seasonal,
      seasonalPattern: seasonal ? pattern : undefined,
      daysUntilStockout: null,
      method: 'exponential_smoothing',
    };
  }

  /**
   * Ensemble forecast combining WMA and exponential smoothing.
   * Weights results by their confidence scores.
   */
  ensemble(dailySales: DailySalesPoint[], forecastPeriod: number): ForecastResult {
    if (dailySales.length < 2) {
      return this.emptyForecast('ensemble', forecastPeriod);
    }

    const wmaResult = this.weightedMovingAverage(dailySales, forecastPeriod);
    const esResult = this.exponentialSmoothing(dailySales, forecastPeriod);

    const totalConfidence = wmaResult.confidence + esResult.confidence;
    const wmaWeight = wmaResult.confidence / totalConfidence;
    const esWeight = esResult.confidence / totalConfidence;

    const predictedDemand = Math.round(
      wmaResult.predictedDemand * wmaWeight + esResult.predictedDemand * esWeight
    );
    const recommendedOrder = Math.ceil(
      wmaResult.recommendedOrder * wmaWeight + esResult.recommendedOrder * esWeight
    );
    const confidence = wmaResult.confidence * wmaWeight + esResult.confidence * esWeight;

    const ci70 = {
      lower: Math.round(wmaResult.confidenceInterval70.lower * wmaWeight + esResult.confidenceInterval70.lower * esWeight),
      upper: Math.round(wmaResult.confidenceInterval70.upper * wmaWeight + esResult.confidenceInterval70.upper * esWeight),
    };
    const ci90 = {
      lower: Math.round(wmaResult.confidenceInterval90.lower * wmaWeight + esResult.confidenceInterval90.lower * esWeight),
      upper: Math.round(wmaResult.confidenceInterval90.upper * wmaWeight + esResult.confidenceInterval90.upper * esWeight),
    };

    // Use the trend from whichever method is more confident
    const primaryResult = wmaResult.confidence >= esResult.confidence ? wmaResult : esResult;

    return {
      predictedDemand,
      recommendedOrder,
      confidence,
      confidenceInterval70: ci70,
      confidenceInterval90: ci90,
      trend: primaryResult.trend,
      trendStrength: primaryResult.trendStrength,
      seasonality: wmaResult.seasonality || esResult.seasonality,
      seasonalPattern: primaryResult.seasonalPattern,
      daysUntilStockout: null,
      method: 'ensemble',
    };
  }

  /**
   * Calculate days until stockout based on current stock and average daily demand.
   */
  calculateDaysUntilStockout(currentStock: number, avgDailyDemand: number): number | null {
    if (avgDailyDemand <= 0) {
      return null;
    }
    return Math.floor(currentStock / avgDailyDemand);
  }

  /**
   * Generate a reorder suggestion based on forecast results and current stock.
   */
  generateReorderSuggestion(
    productId: string,
    productName: string,
    locationId: string,
    currentStock: number,
    forecast: ForecastResult,
    leadTimeDays: number = 7
  ): ReorderSuggestion {
    const dailyDemand = forecast.predictedDemand / (forecast.daysUntilStockout !== null ? forecast.daysUntilStockout : 30);
    // Use a more stable daily demand calculation: predictedDemand / forecastPeriod
    // Since we don't have forecastPeriod here, derive from the forecast
    // For safety: use recommendedOrder as basis with a sensible daily demand
    const effectiveDailyDemand = forecast.predictedDemand > 0
      ? forecast.predictedDemand / 30 // Default assumption: 30-day forecast period
      : 0;

    const safetyStock = effectiveDailyDemand * leadTimeDays * 0.5;
    const daysUntilStockout = this.calculateDaysUntilStockout(currentStock, effectiveDailyDemand);

    // Determine urgency
    let urgency: 'critical' | 'high' | 'medium' | 'low';
    if (daysUntilStockout !== null && daysUntilStockout <= 0) {
      urgency = 'critical';
    } else if (daysUntilStockout !== null && daysUntilStockout <= leadTimeDays) {
      urgency = 'high';
    } else if (daysUntilStockout !== null && daysUntilStockout <= leadTimeDays * 2) {
      urgency = 'medium';
    } else {
      urgency = 'low';
    }

    // Calculate suggested order: demand during lead time + safety stock - current stock
    const demandDuringLeadTime = effectiveDailyDemand * leadTimeDays;
    const suggestedOrderQuantity = Math.max(
      0,
      Math.ceil(demandDuringLeadTime + safetyStock - currentStock)
    );

    // Calculate estimated order-by date
    const estimatedOrderDate = new Date();
    if (daysUntilStockout !== null) {
      const daysBeforeStockout = Math.max(0, daysUntilStockout - leadTimeDays);
      estimatedOrderDate.setDate(estimatedOrderDate.getDate() + daysBeforeStockout);
    }

    return {
      productId,
      productName,
      locationId,
      currentStock,
      predictedDemand: forecast.predictedDemand,
      daysUntilStockout,
      suggestedOrderQuantity,
      urgency,
      estimatedOrderDate,
      confidence: forecast.confidence,
    };
  }

  /**
   * Detect trend direction and strength from a series of values.
   */
  private detectTrend(values: number[]): { direction: 'increasing' | 'decreasing' | 'stable'; strength: number } {
    if (values.length < 4) {
      return { direction: 'stable', strength: 0 };
    }

    const midpoint = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, midpoint);
    const secondHalf = values.slice(midpoint);

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    if (firstAvg === 0 && secondAvg === 0) {
      return { direction: 'stable', strength: 0 };
    }

    const baseline = firstAvg || 1; // Avoid division by zero
    const changeRatio = (secondAvg - firstAvg) / baseline;

    if (changeRatio > 0.1) {
      return { direction: 'increasing', strength: Math.min(Math.abs(changeRatio), 1) };
    } else if (changeRatio < -0.1) {
      return { direction: 'decreasing', strength: Math.min(Math.abs(changeRatio), 1) };
    }

    return { direction: 'stable', strength: Math.abs(changeRatio) };
  }

  /**
   * Calculate standard deviation of a set of values.
   */
  private standardDeviation(values: number[]): number {
    if (values.length < 2) {
      return 0;
    }

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => (v - mean) ** 2);
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);

    return Math.sqrt(variance);
  }

  /**
   * Calculate confidence interval for a prediction.
   */
  private confidenceInterval(
    prediction: number,
    stdDev: number,
    period: number,
    zScore: number
  ): { lower: number; upper: number } {
    // Scale standard deviation by sqrt of period for aggregate prediction
    const margin = zScore * stdDev * Math.sqrt(period);

    return {
      lower: Math.max(0, Math.round(prediction - margin)),
      upper: Math.round(prediction + margin),
    };
  }

  /**
   * Detect day-of-week seasonality patterns.
   * A day is considered seasonal if its average deviates by more than 30% from the overall mean.
   */
  private detectSeasonality(dailySales: DailySalesPoint[]): { seasonal: boolean; pattern: number[] } {
    if (dailySales.length < 14) {
      return { seasonal: false, pattern: [] };
    }

    // Group by day of week (0 = Sunday, 6 = Saturday)
    const dayBuckets: number[][] = [[], [], [], [], [], [], []];

    for (const sale of dailySales) {
      const dayOfWeek = new Date(sale.date).getDay();
      dayBuckets[dayOfWeek].push(sale.quantity);
    }

    // Calculate average for each day of week
    const dayAverages = dayBuckets.map(bucket => {
      if (bucket.length === 0) return 0;
      return bucket.reduce((a, b) => a + b, 0) / bucket.length;
    });

    // Overall mean
    const overallMean = dailySales.reduce((sum, d) => sum + d.quantity, 0) / dailySales.length;

    if (overallMean === 0) {
      return { seasonal: false, pattern: [] };
    }

    // Check if any day deviates by more than 30% from the mean
    const seasonal = dayAverages.some(avg => Math.abs(avg - overallMean) / overallMean > 0.3);

    // Return normalized pattern (ratio to mean)
    const pattern = dayAverages.map(avg => overallMean > 0 ? Math.round((avg / overallMean) * 100) / 100 : 0);

    return { seasonal, pattern };
  }

  /**
   * Calculate forecast confidence based on data quality.
   * More data points + lower coefficient of variation = higher confidence.
   * Range: 0.1 to 0.95
   */
  private calculateConfidence(dataPoints: number, stdDev: number, mean: number): number {
    // Data quantity factor: more data = higher confidence (logarithmic scale)
    const dataFactor = Math.min(1, Math.log(dataPoints + 1) / Math.log(60));

    // Coefficient of variation factor: lower CV = higher confidence
    let cvFactor = 1;
    if (mean > 0) {
      const cv = stdDev / mean;
      cvFactor = Math.max(0, 1 - cv); // CV of 1.0 or more gives 0
    }

    // Combine factors
    const rawConfidence = (dataFactor * 0.5 + cvFactor * 0.5);

    // Clamp to range 0.1 - 0.95
    return Math.max(0.1, Math.min(0.95, rawConfidence));
  }

  /**
   * Return an empty/zero forecast for cases with insufficient data.
   */
  private emptyForecast(method: string, _period: number): ForecastResult {
    return {
      predictedDemand: 0,
      recommendedOrder: 0,
      confidence: 0.1,
      confidenceInterval70: { lower: 0, upper: 0 },
      confidenceInterval90: { lower: 0, upper: 0 },
      trend: 'stable',
      trendStrength: 0,
      seasonality: false,
      daysUntilStockout: null,
      method,
    };
  }
}
