import { Button, Card, Chip, Typography } from '@beachsports/components';
import { Screen } from '../components/Screen';
import type { Preferences, FontSize, Theme } from './preferences';
interface Props {
  preferences: Preferences;
  onChange: (p: Preferences) => void;
  onBack: () => void;
  onHelp: () => void;
}
export function SettingsScreen({ preferences, onChange, onBack, onHelp }: Props) {
  return (
    <Screen title="Configurações" badge="Ajustes" onBack={onBack}>
      <Typography as="h2" variant="heading-l">
        Acessibilidade
      </Typography>
      <Card title="Tamanho da fonte" description="Escolha uma leitura confortável.">
        <div className="option-stack" role="group" aria-label="Tamanho da fonte">
          {(
            [
              ['standard', 'Padrão'],
              ['large', 'Grande'],
              ['extra-large', 'Muito grande'],
            ] as [FontSize, string][]
          ).map(([value, label]) => (
            <Chip
              key={value}
              label={label}
              size="md"
              selected={preferences.fontSize === value}
              onSelectedChange={() => onChange({ ...preferences, fontSize: value })}
            />
          ))}
        </div>
        <Typography variant="text-s" tone="secondary">
          Você pode ajustar o tamanho para facilitar a leitura.
        </Typography>
      </Card>
      <Card title="Aparência" description="Escolha como você prefere ver o app.">
        <div className="option-stack" role="group" aria-label="Tema">
          {(['light', 'dark'] as Theme[]).map((theme) => (
            <Chip
              key={theme}
              size="md"
              label={theme === 'light' ? 'Tema claro' : 'Tema escuro'}
              selected={preferences.theme === theme}
              onSelectedChange={() => onChange({ ...preferences, theme })}
            />
          ))}
        </div>
      </Card>
      <Button variant="ghost" onClick={onHelp}>
        Como usar o Beach Sports
      </Button>
    </Screen>
  );
}
