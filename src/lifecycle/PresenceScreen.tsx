import type { FormEvent } from 'react';
import { Badge, Button, Chip, FormField, Typography } from '@beachsports/components';
import { Page } from './Page';
import type { Player } from './domain';
import styles from './LifecycleApp.module.css';
export function PresenceScreen({
  active,
  presence,
  saving,
  locked,
  error,
  name,
  nameError,
  onName,
  onBack,
  onPresence,
  onPrepare,
  onDeactivate,
  onAdd,
}: {
  active: Player[];
  presence: string[];
  saving: boolean;
  locked: boolean;
  error: string;
  name: string;
  nameError: string;
  onName: (value: string) => void;
  onBack: () => void;
  onPresence: (id: string) => void;
  onPrepare: () => void;
  onDeactivate: (player: Player) => void;
  onAdd: (event: FormEvent) => void;
}) {
  const selected = active.filter((p) => presence.includes(p.id));
  return (
    <Page
      title="Quem veio hoje?"
      description="Toque no jogador para marcar presença. O × abre a desativação."
      badge="Quem veio hoje?"
      onBack={onBack}
      testId="roster-screen"
      footer={
        <Button
          className={styles.full}
          disabled={locked || saving || selected.length < 2}
          onClick={onPrepare}
        >
          Sortear times
        </Button>
      }
    >
      <div role="status">
        <Badge
          size="sm"
          tone="info"
          label={`${selected.length} presentes · ${active.length - selected.length} não marcados`}
        />
      </div>
      {error && (
        <Typography role="alert" className={styles.error}>
          {error}
        </Typography>
      )}
      <ul className={`${styles.chips} ${styles.presence}`} aria-busy={saving || undefined}>
        {active.map((player) => (
          <li key={player.id}>
            <Chip
              label={player.name}
              size="md"
              selected={presence.includes(player.id)}
              // Reserve the public icon slot; Chip draws its own check when selected.
              icon={<span />}
              showSelectionIndicator
              disabled={locked}
              onSelectedChange={() => onPresence(player.id)}
              onRemove={() => onDeactivate(player)}
              removeLabel={`Desativar ${player.name}`}
            />
          </li>
        ))}
      </ul>
      {!active.length && <Typography>Cadastre o primeiro jogador para começar.</Typography>}
      <form className={styles.stack} onSubmit={onAdd} noValidate>
        <FormField
          label="Nome do jogador"
          placeholder="Ex.: Lana"
          value={name}
          maxLength={30}
          onChange={(e) => onName(e.target.value)}
          {...(nameError
            ? { validation: 'error' as const, errorMessage: nameError }
            : { validation: 'none' as const })}
        />
        <Button type="submit" variant="secondary" disabled={locked || !name.trim()}>
          Adicionar
        </Button>
      </form>
    </Page>
  );
}
