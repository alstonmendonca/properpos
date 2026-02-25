'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

interface ForecastData {
  productId: string;
  predictedDemand: number;
  recommendedOrder: number;
  confidence: number;
  confidenceInterval70: { lower: number; upper: number };
  confidenceInterval90: { lower: number; upper: number };
  trend: string;
  historicalAverage: number;
  method: string;
}

interface ForecastChartProps {
  forecasts: ForecastData[];
  title?: string;
}

interface ChartDataPoint {
  name: string;
  predicted: number;
  recommended: number;
  historical: number;
  ci70Lower: number;
  ci70Upper: number;
  ci90Lower: number;
  ci90Upper: number;
  confidence: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-md p-3 text-sm">
      <p className="font-semibold mb-2">{label}</p>
      <div className="space-y-1">
        {payload.map((entry: any, index: number) => {
          if (entry.dataKey === 'ci90Lower' || entry.dataKey === 'ci90Upper' ||
              entry.dataKey === 'ci70Lower' || entry.dataKey === 'ci70Upper') {
            return null;
          }
          return (
            <div key={index} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium">{Math.round(entry.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function ForecastChart({ forecasts, title = 'Demand Forecast' }: ForecastChartProps) {
  if (!forecasts || forecasts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="w-5 h-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">No forecast data available</h3>
            <p className="text-sm text-muted-foreground">
              Forecast data will appear here once there is enough sales history to generate predictions.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData: ChartDataPoint[] = forecasts.map((forecast) => {
    const truncatedName = forecast.productId.length > 12
      ? forecast.productId.substring(0, 12) + '...'
      : forecast.productId;

    return {
      name: truncatedName,
      predicted: Math.round(forecast.predictedDemand),
      recommended: Math.round(forecast.recommendedOrder),
      historical: Math.round(forecast.historicalAverage * 30),
      ci70Lower: Math.round(forecast.confidenceInterval70.lower),
      ci70Upper: Math.round(forecast.confidenceInterval70.upper),
      ci90Lower: Math.round(forecast.confidenceInterval90.lower),
      ci90Upper: Math.round(forecast.confidenceInterval90.upper),
      confidence: Math.round(forecast.confidence * 100),
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart3 className="w-5 h-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />

            {/* 90% Confidence Interval - lightest fill */}
            <Area
              type="monotone"
              dataKey="ci90Upper"
              stroke="none"
              fill="hsl(var(--primary))"
              fillOpacity={0.08}
              name="90% CI Upper"
              legendType="none"
            />
            <Area
              type="monotone"
              dataKey="ci90Lower"
              stroke="none"
              fill="hsl(var(--background))"
              fillOpacity={1}
              name="90% CI Lower"
              legendType="none"
            />

            {/* 70% Confidence Interval - slightly darker */}
            <Area
              type="monotone"
              dataKey="ci70Upper"
              stroke="none"
              fill="hsl(var(--primary))"
              fillOpacity={0.15}
              name="70% CI Upper"
              legendType="none"
            />
            <Area
              type="monotone"
              dataKey="ci70Lower"
              stroke="none"
              fill="hsl(var(--background))"
              fillOpacity={1}
              name="70% CI Lower"
              legendType="none"
            />

            {/* Historical Average - dashed gray */}
            <Line
              type="monotone"
              dataKey="historical"
              stroke="#9ca3af"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="Historical Avg (30d)"
            />

            {/* Predicted Demand - primary color, solid */}
            <Line
              type="monotone"
              dataKey="predicted"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 4, fill: 'hsl(var(--primary))' }}
              activeDot={{ r: 6 }}
              name="Predicted Demand"
            />

            {/* Recommended Order - green, solid */}
            <Line
              type="monotone"
              dataKey="recommended"
              stroke="#22c55e"
              strokeWidth={2}
              dot={{ r: 4, fill: '#22c55e' }}
              activeDot={{ r: 6 }}
              name="Recommended Order"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
