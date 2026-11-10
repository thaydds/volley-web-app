import { useEffect, useRef, type ReactNode } from 'react';
import { Badge, Button, Typography } from '@beachsports/components';
import styles from './LifecycleApp.module.css';
export function Page({
  title,
  description,
  badge,
  onBack,
  children,
  footer,
  testId,
}: {
  title: string;
  description?: string;
  badge?: string;
  onBack?: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  testId?: string;
}) {
  const heading = useRef<HTMLElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [title]);
  return (
    <div className={styles.page} data-testid={testId}>
      <header className={styles.header}>
        {onBack ? (
          <Button variant="ghost" onClick={onBack}>
            Voltar
          </Button>
        ) : (
          <Typography className={styles.brand} variant="label-m" tone="secondary">
            Beach Sports
          </Typography>
        )}
        {badge && <Badge size="sm" tone="info" label={badge} />}
      </header>
      <main className={styles.content}>
        <Typography as="h1" variant="display-m" ref={heading} tabIndex={-1}>
          {title}
        </Typography>
        {description && <Typography tone="secondary">{description}</Typography>}
        {children}
      </main>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </div>
  );
}
