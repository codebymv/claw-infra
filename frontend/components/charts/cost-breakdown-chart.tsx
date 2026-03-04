'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import type { CostByModel, CostByAgent } from '@/lib/api';

const COLORS = ['#00dc82', '#38bdf8', '#f472b6', '#fbbf24', '#a78bfa', '#2dd4bf', '#fb923c'];

interface CostByModelChartProps {
  data: CostByModel[];
}

export function CostByModelChart({ data }: CostByModelChartProps) {
  const chartData = data.map((d, i) => ({
    name: `${d.provider}/${d.model}`,
    value: parseFloat(d.totalCostUsd),
    color: COLORS[i % COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          outerRadius={80}
          innerRadius={40}
          dataKey="value"
          label={({ name, percent }: { name: string; percent: number }) =>
            `${name} (${(percent * 100).toFixed(0)}%)`
          }
          labelLine={{ stroke: 'hsl(215 20% 50% / 0.3)' }}
          stroke="hsl(222 47% 6%)"
          strokeWidth={2}
        >
          {chartData.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Pie>
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
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

interface CostByAgentChartProps {
  data: CostByAgent[];
}

export function CostByAgentChart({ data }: CostByAgentChartProps) {
  const chartData = data.map((d) => ({
    name: d.agentName || 'unknown',
    cost: parseFloat(d.totalCostUsd),
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 40)}>
      <BarChart layout="vertical" data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 25% 14% / 0.5)" />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: 'hsl(215 20% 50% / 0.6)', fontFamily: 'var(--font-jetbrains)' }}
          tickFormatter={(v: number) => `$${v.toFixed(2)}`}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 10, fill: 'hsl(215 20% 50% / 0.6)', fontFamily: 'var(--font-dm-sans)' }}
          width={100}
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
        />
        <Bar dataKey="cost" fill="#00dc82" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
