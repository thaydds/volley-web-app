import type { ReactNode } from 'react';
import { Badge, Button, Card, Typography } from '@beachsports/components';
import { Page } from './Page';
import styles from './LifecycleApp.module.css';
declare const __APP_BUILD_VERSION__: string;
export function HomeScreen({
  status,
  syncedAt,
  online,
  locked,
  syncing,
  pending,
  error,
  onSync,
  onRanking,
  onMatches,
  onSettings,
  onRoster,
  children,
}: {
  status: string;
  syncedAt?: string;
  online: boolean;
  locked: boolean;
  syncing: boolean;
  pending: number;
  error: string;
  onSync: () => void;
  onRanking: () => void;
  onMatches: () => void;
  onSettings: () => void;
  onRoster: () => void;
  children?: ReactNode;
}) {
  const date = syncedAt ? new Date(syncedAt) : null;
  const time =
    date?.toLocaleDateString('pt-BR') === new Date().toLocaleDateString('pt-BR')
      ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : date?.toLocaleString('pt-BR');
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
          <Typography variant="text-s" tone="secondary">
            Beach Sports · v{__APP_BUILD_VERSION__}
          </Typography>
        </>
      }
    >
      <div role="status">
        <Badge
          size="sm"
          tone={pending || !online ? 'info' : error ? 'danger' : 'success'}
          label={status}
        />
      </div>
      <Typography variant="text-s" tone="secondary">
        {date ? (
          <>
            Última sincronização às{' '}
            <time dateTime={date.toISOString()} title={date.toLocaleString('pt-BR')}>
              {time}
            </time>
          </>
        ) : (
          'Ainda não sincronizado'
        )}
      </Typography>
      <Button
        variant="secondary"
        className={styles.full}
        disabled={!online || locked}
        loading={syncing}
        onClick={onSync}
      >
        Sincronizar
      </Button>
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
