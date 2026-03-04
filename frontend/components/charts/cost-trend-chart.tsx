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
            <stop offset="5%" stopColor="#00dc82" stopOpacity={0.25} />
            <stop offset="50%" stopColor="#00dc82" stopOpacity={0.05} />
            <stop offset="95%" stopColor="#00dc82" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 25% 14% / 0.5)" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 10, fill: 'hsl(215 20% 50% / 0.6)', fontFamily: 'var(--font-jetbrains)' }}
          tickFormatter={(v: string) => {
            try { return format(parseISO(v), 'MMM d'); } catch { return v; }
          }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'hsl(215 20% 50% / 0.6)', fontFamily: 'var(--font-jetbrains)' }}
          tickFormatter={(v: number) => `$${v.toFixed(2)}`}
        />
        <Tooltip
          contentStyle={{
            background: 'hsl(222 47% 6%)',
            border: '1px solid hsl(215 25% 14% / 0.5)',
            borderRadius: '10px',
            fontSize: '11px',
            fontFamily: 'var(--font-jetbrains)',
            boxShadow: '0 8px 30px -10px rgba(0,0,0,0.5)',
          }}
          formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost']}
          labelFormatter={(v: string) => {
            try { return format(parseISO(v), 'MMM d, yyyy'); } catch { return v; }
          }}
        />
        {dailyBudget && (
          <ReferenceLine
            y={dailyBudget}
            stroke="#ff4757"
            strokeDasharray="4 4"
            label={{ value: 'Budget', fontSize: 10, fill: '#ff4757' }}
          />
        )}
        <Area
          type="monotone"
          dataKey="cost"
          stroke="#00dc82"
          strokeWidth={2}
          fill="url(#costGradient)"
          dot={false}
          activeDot={{ r: 4, fill: '#00dc82', stroke: 'hsl(222 47% 6%)', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
