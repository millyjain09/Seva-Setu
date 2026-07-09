import { Globe, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { SUPPORTED_LANGUAGES } from '@/i18n/config';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export const LanguageSwitcher = ({ compact = false }: { compact?: boolean }) => {
  const { i18n, t } = useTranslation();
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[0];

  const change = (code: string) => {
    i18n.changeLanguage(code);
    const next = SUPPORTED_LANGUAGES.find((l) => l.code === code);
    toast.success(t('notif.langChanged'), { description: next?.native });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? 'icon' : 'sm'}
          className={cn(
            'rounded-xl gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted',
            compact ? 'h-8 w-8 sm:h-9 sm:w-9' : 'h-9 px-2.5'
          )}
          aria-label={t('common.language')}
        >
          <Globe className="h-4 w-4" />
          {!compact && <span className="text-xs font-semibold">{current.code.toUpperCase()}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1.5 rounded-2xl">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2.5 py-1.5">
          {t('common.language')}
        </p>
        <div className="max-h-[60vh] overflow-y-auto">
          {SUPPORTED_LANGUAGES.map((l) => {
            const active = l.code === i18n.language;
            return (
              <button
                key={l.code}
                onClick={() => change(l.code)}
                className={cn(
                  'w-full flex items-center justify-between rounded-xl px-2.5 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
                )}
              >
                <span className="flex items-center gap-2.5">
                  <span className="text-[10px] font-bold w-7 text-center rounded-md bg-muted px-1 py-0.5">
                    {l.code.toUpperCase()}
                  </span>
                  <span>{l.native}</span>
                </span>
                {active && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};