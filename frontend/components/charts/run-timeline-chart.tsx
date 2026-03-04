'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import type { TimelinePoint } from '@/lib/api';

interface Props {
  data: TimelinePoint[];
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#34d399',
  failed: '#f87171',
  cancelled: '#6b7280',
  running: '#60a5fa',
  queued: '#a78bfa',
};

function transformData(raw: TimelinePoint[]) {
  const map = new Map<string, Record<string, number | string>>();
  raw.forEach(({ day, status, count }) => {
    const key = day.split('T')[0];
    if (!map.has(key)) map.set(key, { day: key });
    map.get(key)![status] = parseInt(count);
  });
  return Array.from(map.values());
}

export function RunTimelineChart({ data }: Props) {
  const chartData = transformData(data);
  const statuses = Array.from(new Set(data.map((d) => d.status)));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v: string) => {
            try { return format(parseISO(v), 'MMM d'); } catch { return v; }
          }}
        />
        <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            fontSize: '12px',
          }}
          labelFormatter={(v: string) => {
            try { return format(parseISO(v), 'MMM d, yyyy'); } catch { return v; }
          }}
        />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
        {statuses.map((status) => (
          <Bar
            key={status}
            dataKey={status}
            stackId="runs"
            fill={STATUS_COLORS[status] || '#8884d8'}
            radius={status === statuses[statuses.length - 1] ? [3, 3, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
