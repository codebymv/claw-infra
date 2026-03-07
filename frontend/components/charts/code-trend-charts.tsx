'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import type { CodeTrendPoint } from '@/lib/api';

interface VolumeProps {
  data: CodeTrendPoint[];
}

export function CodeVolumeChart({ data }: VolumeProps) {
  const chartData = data.map((d) => ({
    day: d.day.split('T')[0],
    prsOpened: parseInt(d.prsOpened || '0', 10),
    prsMerged: parseInt(d.prsMerged || '0', 10),
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
        <defs>
          <linearGradient id="prsOpenedGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-jetbrains)' }}
          tickFormatter={(v: string) => {
            try {
              return format(parseISO(v), 'MMM d');
            } catch {
              return v;
            }
          }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-jetbrains)' }}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--chart-tooltip-bg))',
            border: '1px solid hsl(var(--chart-tooltip-border))',
            borderRadius: '10px',
            fontSize: '11px',
            fontFamily: 'var(--font-jetbrains)',
            color: 'hsl(var(--foreground))',
          }}
          labelFormatter={(v: string) => {
            try {
              return format(parseISO(v), 'MMM d, yyyy');
            } catch {
              return v;
            }
          }}
        />
        <Area type="monotone" dataKey="prsOpened" name="Opened" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#prsOpenedGradient)" />
        <Line type="monotone" dataKey="prsMerged" name="Merged" stroke="hsl(var(--chart-2, 160 84% 39%))" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CodeLocChart({ data }: VolumeProps) {
  const chartData = data.map((d) => ({
    day: d.day.split('T')[0],
    additions: parseInt(d.additions || '0', 10),
    deletions: parseInt(d.deletions || '0', 10),
    net: parseInt(d.additions || '0', 10) - parseInt(d.deletions || '0', 10),
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
        <defs>
          <linearGradient id="additionsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="rgb(16 185 129)" stopOpacity={0.25} />
            <stop offset="95%" stopColor="rgb(16 185 129)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="deletionsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="rgb(244 63 94)" stopOpacity={0.22} />
            <stop offset="95%" stopColor="rgb(244 63 94)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-jetbrains)' }}
          tickFormatter={(v: string) => {
            try {
              return format(parseISO(v), 'MMM d');
            } catch {
              return v;
            }
          }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-jetbrains)' }}
        />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--chart-tooltip-bg))',
            border: '1px solid hsl(var(--chart-tooltip-border))',
            borderRadius: '10px',
            fontSize: '11px',
            fontFamily: 'var(--font-jetbrains)',
            color: 'hsl(var(--foreground))',
          }}
          formatter={(v: number, name: string) => [v.toLocaleString(), name]}
          labelFormatter={(v: string) => {
            try {
              return format(parseISO(v), 'MMM d, yyyy');
            } catch {
              return v;
            }
          }}
        />
        <Area type="monotone" dataKey="additions" name="Additions" stroke="rgb(16 185 129)" strokeWidth={2} fill="url(#additionsGradient)" />
        <Area type="monotone" dataKey="deletions" name="Deletions" stroke="rgb(244 63 94)" strokeWidth={2} fill="url(#deletionsGradient)" />
        <Line type="monotone" dataKey="net" name="Net" stroke="hsl(var(--primary))" strokeWidth={1.75} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CodeLatencyChart({ data }: VolumeProps) {
  const chartData = data.map((d) => ({
    day: d.day.split('T')[0],
    mergeHours: d.avgMergeLatencySeconds ? Math.round((parseFloat(d.avgMergeLatencySeconds) / 3600) * 10) / 10 : null,
    reviewHours: d.avgFirstReviewLatencySeconds
      ? Math.round((parseFloat(d.avgFirstReviewLatencySeconds) / 3600) * 10) / 10
      : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-jetbrains)' }}
          tickFormatter={(v: string) => {
            try {
              return format(parseISO(v), 'MMM d');
            } catch {
              return v;
            }
          }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-jetbrains)' }}
          unit="h"
        />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--chart-tooltip-bg))',
            border: '1px solid hsl(var(--chart-tooltip-border))',
            borderRadius: '10px',
            fontSize: '11px',
            fontFamily: 'var(--font-jetbrains)',
            color: 'hsl(var(--foreground))',
          }}
          formatter={(v: number, name: string) => [`${v}h`, name === 'mergeHours' ? 'Merge latency' : 'First review latency']}
          labelFormatter={(v: string) => {
            try {
              return format(parseISO(v), 'MMM d, yyyy');
            } catch {
              return v;
            }
          }}
        />
        <Line type="monotone" dataKey="mergeHours" stroke="hsl(var(--primary))" strokeWidth={2.25} dot={false} name="mergeHours" connectNulls />
        <Line type="monotone" dataKey="reviewHours" stroke="rgb(56 189 248)" strokeWidth={2} dot={false} name="reviewHours" connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
