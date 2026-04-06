'use client';

import { useEffect, useState } from 'react';
import { Cpu, HardDrive, Activity, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGlobalStatus } from '@/hooks/useGlobalStatus';
import type { ResourceSnapshot } from '@/lib/api';

interface ResourceGaugeProps {
  value: number;
  max?: number;
  label: string;
  unit?: string;
  icon: React.ComponentType<{ className?: string }>;
  colorThresholds?: { warning: number; critical: number };
  className?: string;
}

function ResourceGauge({
  value,
  max = 100,
  label,
  unit = '%',
  icon: Icon,
  colorThresholds = { warning: 70, critical: 90 },
  className,
}: ResourceGaugeProps) {
  const percentage = Math.min((value / max) * 100, 100);
  const circumference = 2 * Math.PI * 36;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getColor = () => {
    if (percentage >= colorThresholds.critical) return 'text-rose-500';
    if (percentage >= colorThresholds.warning) return 'text-amber-500';
    return 'text-emerald-500';
  };

  const getBgColor = () => {
    if (percentage >= colorThresholds.critical) return 'bg-rose-500/10';
    if (percentage >= colorThresholds.warning) return 'bg-amber-500/10';
    return 'bg-emerald-500/10';
  };

  return (
    <div className={cn('flex flex-col items-center p-4 rounded-xl border border-border bg-card', className)}>
      <div className={cn('relative w-24 h-24', getBgColor(), 'rounded-full')}>
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40"
            cy="40"
            r="36"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-muted/20"
          />
          <circle
            cx="40"
            cy="40"
            r="36"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={cn('transition-all duration-500', getColor())}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon className={cn('h-4 w-4 mb-0.5', getColor())} />
          <span className="text-lg font-bold font-mono">
            {unit === '%' ? Math.round(value) : value.toFixed(1)}
          </span>
          {unit !== '%' && <span className="text-[10px] text-muted-foreground">{unit}</span>}
        </div>
      </div>
      <span className="mt-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

interface ResourceMetricsProps {
  initialData?: ResourceSnapshot | null;
  className?: string;
}

export function ResourceMetrics({ initialData, className }: ResourceMetricsProps) {
  const { liveResources, wsStatus } = useGlobalStatus();
  const [metrics, setMetrics] = useState<ResourceSnapshot | null>(initialData || null);

  useEffect(() => {
    if (liveResources) {
      setMetrics(liveResources);
    }
  }, [liveResources]);

  const isLive = wsStatus === 'connected' && metrics !== null;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Resource Metrics</h3>
        {isLive && (
          <span className="flex items-center gap-1.5 text-[11px] text-primary font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Live
          </span>
        )}
      </div>

      {!metrics ? (
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col items-center p-4 rounded-xl border border-border bg-card/50 animate-pulse">
              <div className="w-24 h-24 rounded-full bg-muted" />
              <div className="mt-2 w-16 h-3 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <ResourceGauge
            value={metrics.cpuPercent}
            label="CPU"
            icon={Cpu}
            colorThresholds={{ warning: 70, critical: 90 }}
          />
          <ResourceGauge
            value={metrics.memoryPercent}
            label="Memory"
            icon={HardDrive}
            colorThresholds={{ warning: 80, critical: 95 }}
          />
          <ResourceGauge
            value={metrics.memoryMb}
            max={8192}
            label="RAM"
            unit="MB"
            icon={Activity}
            colorThresholds={{ warning: 70, critical: 95 }}
          />
          <ResourceGauge
            value={metrics.activeConnections || 0}
            max={100}
            label="Connections"
            icon={Wifi}
            colorThresholds={{ warning: 70, critical: 90 }}
          />
        </div>
      )}

      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
          <MetricDetail label="Disk Read" value={`${(metrics.diskIoReadMb || 0).toFixed(2)} MB`} />
          <MetricDetail label="Disk Write" value={`${(metrics.diskIoWriteMb || 0).toFixed(2)} MB`} />
          <MetricDetail label="Network In" value={`${(metrics.networkInMb || 0).toFixed(2)} MB`} />
          <MetricDetail label="Network Out" value={`${(metrics.networkOutMb || 0).toFixed(2)} MB`} />
        </div>
      )}
    </div>
  );
}

function MetricDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-mono font-medium">{value}</p>
    </div>
  );
}

export default ResourceMetrics;