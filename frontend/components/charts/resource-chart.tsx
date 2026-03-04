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
  const color = metric === 'cpu' ? '#60a5fa' : '#34d399';

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v: string) => {
            try { return format(parseISO(v), 'HH:mm'); } catch { return v; }
          }}
        />
        <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            fontSize: '11px',
          }}
        />
        <Legend wrapperStyle={{ fontSize: '11px' }} />
        <Line
          type="monotone"
          dataKey="avg"
          name={`Avg ${label}`}
          stroke={color}
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="max"
          name={`Max ${label}`}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="4 4"
          dot={false}
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

const RADIAN = Math.PI / 180;

export function GaugeChart({ value, max = 100, label, unit = '%', color = '#60a5fa' }: GaugeProps) {
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
        <p className="text-xl font-bold tabular-nums">
          {value.toFixed(1)}{unit}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
