'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import type { MetricsHistory } from '@/lib/api';

interface ResourceHistoryChartProps {
  data: MetricsHistory[];
  metric: 'cpu' | 'memory';
}

export function ResourceHistoryChart({ data, metric }: ResourceHistoryChartProps) {
  const chartData = data.map((d) => ({
    time: d.time,
    avg: metric === 'cpu' ? parseFloat(d.avgCpu) : parseFloat(d.avgMemoryMb),
    max: metric === 'cpu' ? parseFloat(d.maxCpu) : parseFloat(d.maxMemoryMb),
  }));

  const label = metric === 'cpu' ? 'CPU %' : 'Memory MB';
  const color = metric === 'cpu' ? '#00dc82' : '#38bdf8';

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-jetbrains)' }}
          tickFormatter={(v: string) => {
            try { return format(parseISO(v), 'HH:mm'); } catch { return v; }
          }}
        />
        <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-jetbrains)' }} />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--chart-tooltip-bg))',
            border: '1px solid hsl(var(--chart-tooltip-border))',
            borderRadius: '10px',
            fontSize: '10px',
            fontFamily: 'var(--font-jetbrains)',
            color: 'hsl(var(--foreground))',
            boxShadow: '0 8px 30px -10px rgba(0,0,0,0.3)',
          }}
        />
        <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'var(--font-dm-sans)' }} />
        <Line
          type="monotone"
          dataKey="avg"
          name={`Avg ${label}`}
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, fill: color, stroke: 'hsl(var(--background))', strokeWidth: 2 }}
        />
        <Line
          type="monotone"
          dataKey="max"
          name={`Max ${label}`}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="4 4"
          dot={false}
          opacity={0.4}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface GaugeProps {
  value: number;
  max?: number;
  label: string;
  unit?: string;
  color?: string;
}

export function GaugeChart({ value, max = 100, label, unit = '%', color = '#00dc82' }: GaugeProps) {
  const pct = Math.min(value / max, 1);
  const data = [
    { value: pct, fill: color },
    { value: 1 - pct, fill: 'hsl(var(--muted))' },
  ];

  return (
    <div className="flex flex-col items-center">
      <PieChart width={120} height={70}>
        <Pie
          data={data}
          cx={60}
          cy={60}
          startAngle={180}
          endAngle={0}
          innerRadius={40}
          outerRadius={56}
          dataKey="value"
          stroke="none"
        >
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.fill} />
          ))}
        </Pie>
      </PieChart>
      <div className="-mt-4 text-center">
        <p className="font-display text-xl font-bold tabular-nums">
          {value.toFixed(1)}{unit}
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  );
}
