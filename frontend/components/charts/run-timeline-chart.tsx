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
  completed: '#00dc82',
  failed: '#ff4757',
  cancelled: '#4b5563',
  running: '#38bdf8',
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
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 25% 14% / 0.5)" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 10, fill: 'hsl(215 20% 50% / 0.6)', fontFamily: 'var(--font-jetbrains)' }}
          tickFormatter={(v: string) => {
            try { return format(parseISO(v), 'MMM d'); } catch { return v; }
          }}
        />
        <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 50% / 0.6)', fontFamily: 'var(--font-jetbrains)' }} />
        <Tooltip
          contentStyle={{
            background: 'hsl(222 47% 6%)',
            border: '1px solid hsl(215 25% 14% / 0.5)',
            borderRadius: '10px',
            fontSize: '11px',
            fontFamily: 'var(--font-jetbrains)',
            boxShadow: '0 8px 30px -10px rgba(0,0,0,0.5)',
          }}
          labelFormatter={(v: string) => {
            try { return format(parseISO(v), 'MMM d, yyyy'); } catch { return v; }
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: '10px', fontFamily: 'var(--font-dm-sans)' }}
        />
        {statuses.map((status) => (
          <Bar
            key={status}
            dataKey={status}
            stackId="runs"
            fill={STATUS_COLORS[status] || '#8884d8'}
            radius={status === statuses[statuses.length - 1] ? [4, 4, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
