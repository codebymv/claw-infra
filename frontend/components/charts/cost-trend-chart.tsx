'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import type { CostTrendPoint } from '@/lib/api';

interface Props {
  data: CostTrendPoint[];
  dailyBudget?: number | null;
}

export function CostTrendChart({ data, dailyBudget }: Props) {
  const chartData = data.map((d) => ({
    day: d.day.split('T')[0],
    cost: parseFloat(d.totalCostUsd),
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
        <defs>
          <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v: string) => {
            try { return format(parseISO(v), 'MMM d'); } catch { return v; }
          }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v: number) => `$${v.toFixed(2)}`}
        />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            fontSize: '12px',
          }}
          formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost']}
          labelFormatter={(v: string) => {
            try { return format(parseISO(v), 'MMM d, yyyy'); } catch { return v; }
          }}
        />
        {dailyBudget && (
          <ReferenceLine
            y={dailyBudget}
            stroke="hsl(var(--destructive))"
            strokeDasharray="4 4"
            label={{ value: 'Budget', fontSize: 11, fill: 'hsl(var(--destructive))' }}
          />
        )}
        <Area
          type="monotone"
          dataKey="cost"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#costGradient)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
