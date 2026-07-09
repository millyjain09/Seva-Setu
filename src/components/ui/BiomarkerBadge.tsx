import { CheckCircle2, AlertTriangle } from 'lucide-react';

interface BiomarkerBadgeProps {
  name: string;
  value: string;
  status: 'normal' | 'warning' | 'critical';
}

export const BiomarkerBadge = ({ name, value, status }: BiomarkerBadgeProps) => {
  const styles = {
    normal: {
      bg: 'bg-primary/10',
      text: 'text-primary',
      border: 'border-primary/20',
      icon: CheckCircle2,
    },
    warning: {
      bg: 'bg-accent/10',
      text: 'text-accent',
      border: 'border-accent/20',
      icon: AlertTriangle,
    },
    critical: {
      bg: 'bg-destructive/10',
      text: 'text-destructive',
      border: 'border-destructive/20',
      icon: AlertTriangle,
    },
  };

  const s = styles[status];
  const Icon = s.icon;

  return (
    <div className={`flex items-center gap-2.5 rounded-xl ${s.bg} border ${s.border} px-3 py-2.5 transition-all hover:scale-[1.02]`}>
      <Icon className={`h-4 w-4 ${s.text} shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">{name}</p>
        <p className={`text-[11px] font-medium ${s.text}`}>{value}</p>
      </div>
      <span className={`text-[9px] font-bold uppercase tracking-wider ${s.text} px-2 py-0.5 rounded-full ${s.bg}`}>
        {status}
      </span>
    </div>
  );
};
