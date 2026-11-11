import type { ReactNode } from 'react';
import { Button, Card, Typography } from '@beachsports/components';
import { Page } from './Page';
import styles from './LifecycleApp.module.css';
declare const __APP_BUILD_VERSION__: string;
export function HomeScreen({
  status,
  syncedAt,
  online,
  syncing,
  pending,
  error,
  onRanking,
  onMatches,
  onSettings,
  onRoster,
  children,
}: {
  status: string;
  syncedAt?: string;
  online: boolean;
  syncing: boolean;
  pending: number;
  error: string;
  onRanking: () => void;
  onMatches: () => void;
  onSettings: () => void;
  onRoster: () => void;
  children?: ReactNode;
}) {
  const date = syncedAt ? new Date(syncedAt) : null;
  const time = date?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const last = date ? `última ${time}` : 'sem sync';
  const compact = !online
    ? `Offline · ${last}`
    : syncing
      ? 'Sincronizando…'
      : status === 'review'
        ? 'Revisão pendente'
        : status === 'failure'
          ? `Falha · ${last}`
          : pending
            ? 'Envio pendente'
            : date
              ? `Última sync ${time}`
              : 'Ainda sem sync';
  return (
    <Page
      title="Bora pra areia?"
      description="Organize os times e acompanhe suas partidas."
      badge="VÔLEI"
      testId="home-screen"
      footer={
        <>
          <nav className={styles.navigation} aria-label="Navegação principal">
            <Button variant="ghost" size="sm" onClick={onRanking}>
              Ranking
            </Button>
            <Button variant="ghost" size="sm" onClick={onMatches}>
              Partidas
            </Button>
            <Button variant="ghost" size="sm" onClick={onSettings}>
              Ajustes
            </Button>
          </nav>
          <div className={styles.syncFooter}>
            <Typography
              variant="label-s"
              tone="secondary"
              className={styles.version}
              title={`Versão ${__APP_BUILD_VERSION__}`}
            >
              v{__APP_BUILD_VERSION__}
            </Typography>
            <Typography
              variant="label-s"
              tone="secondary"
              role="status"
              className={styles.syncStatus}
              data-testid="sync-status"
              title={
                date
                  ? `Última sincronização confirmada: ${date.toLocaleString('pt-BR')}`
                  : undefined
              }
            >
              {compact}
            </Typography>
          </div>
        </>
      }
    >
      {error && (
        <Typography role="alert" className={styles.error}>
          {error}
        </Typography>
      )}
      {children}
      <Card
        title="Próxima partida"
        description="Marque quem veio e prepare os times."
        footer={
          <Button className={styles.full} onClick={onRoster}>
            Preparar nova partida
          </Button>
        }
      />
      <Card
        title="Cartas"
        description="Consulte os jogadores da sua comunidade."
        footer={
          <Button
            className={styles.full}
            variant="secondary"
            disabled
            aria-describedby="cards-unavailable"
          >
            Cartas
          </Button>
        }
      >
        <div className={styles.stack}>
          <Typography variant="text-s" tone="secondary">
            Os mesmos participantes, prontos para a próxima rodada.
          </Typography>
          <Typography id="cards-unavailable" variant="text-s" tone="secondary">
            Em breve.
          </Typography>
        </div>
      </Card>
    </Page>
  );
}
