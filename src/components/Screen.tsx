import { useEffect, useRef, type ReactNode } from 'react';
import { Badge, Typography } from '@beachsports/components';
import { BackButton } from './BackButton';

interface ScreenProps {
  title: string;
  titleVariant?: 'display-m' | 'display-l';
  description?: string;
  badge?: string;
  onBack?: () => void;
  backLabel?: string;
  backTestId?: string;
  children?: ReactNode;
  footer?: ReactNode;
  testId?: string;
}

/** App layout only; all visual controls and type come from the shared DS. */
export function Screen({
  title,
  titleVariant = 'display-m',
  description,
  badge,
  onBack,
  backLabel = 'Voltar',
  backTestId = 'screen-back',
  children,
  footer,
  testId,
}: ScreenProps) {
  const heading = useRef<HTMLElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [title]);
  return (
    <div className="screen" data-testid={testId}>
      <header className="screen-header">
        {onBack ? (
          <BackButton onClick={onBack} label={backLabel} testId={backTestId} />
        ) : (
          <Typography className="app-brand" variant="label-m" tone="secondary">
            Beach Sports
          </Typography>
        )}
        {badge && <Badge tone="info" size="sm" label={badge} />}
      </header>
      <main className="screen-content">
        <Typography as="h1" ref={heading} tabIndex={-1} variant={titleVariant}>
          {title}
        </Typography>
        {description && (
          <Typography variant="text-m" tone="secondary">
            {description}
          </Typography>
        )}
        {children}
      </main>
      {footer && <footer className="screen-footer">{footer}</footer>}
    </div>
  );
}
