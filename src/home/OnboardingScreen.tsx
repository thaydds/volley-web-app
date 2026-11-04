import { Badge, Button, Card, Typography } from '@beachsports/components';
import { Screen } from '../components/Screen';
export function OnboardingScreen({ onStart, onBack }: { onStart: () => void; onBack: () => void }) {
  return (
    <Screen
      title="Beach Sports"
      titleVariant="display-l"
      badge="Boas-vindas"
      onBack={onBack}
      footer={
        <Button className="full-width" size="lg" onClick={onStart}>
          Começar
        </Button>
      }
    >
      <Typography as="h2" variant="heading-l">
        Seu vôlei, organizado.
      </Typography>
      <Typography variant="text-l" tone="secondary">
        Monte os times, registre partidas e acompanhe o ranking.
      </Typography>
      <Card title="Da areia ao resultado" description="Tudo pronto para o próximo encontro.">
        <Badge tone="info" label="Vôlei de praia" />
      </Card>
    </Screen>
  );
}
