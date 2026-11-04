import { Button, Card, Typography } from '@beachsports/components';
import { Screen } from '../components/Screen';
interface HomeProps {
  onMatches: () => void;
  onRanking: () => void;
  onHistory: () => void;
  onSettings?: () => void;
}
export function Home({ onMatches, onRanking, onHistory, onSettings }: HomeProps) {
  return (
    <Screen
      title="Bora pra areia?"
      description="Organize os jogadores, monte os times e acompanhe cada partida."
      badge="VÔLEI DE PRAIA"
      testId="home-screen"
      footer={
        <nav className="home-nav" aria-label="Navegação principal">
          <Button variant="ghost" size="sm" data-testid="home-ranking-button" onClick={onRanking}>
            Ranking
          </Button>
          <Button variant="ghost" size="sm" data-testid="home-history-button" onClick={onHistory}>
            Partidas
          </Button>
          <Button variant="ghost" size="sm" onClick={onSettings}>
            Ajustes
          </Button>
        </nav>
      }
    >
      <Card
        title="Sua próxima partida"
        description="Quem veio hoje? Selecione os jogadores para começar."
        footer={
          <Button
            size="lg"
            className="full-width"
            data-testid="home-montar-time"
            onClick={onMatches}
          >
            Montar o time!
          </Button>
        }
      >
        <Typography variant="text-m" tone="secondary">
          Do encontro na quadra ao resultado, tudo em um só lugar.
        </Typography>
      </Card>
      <Card
        title="Cartas"
        description="Consulte os jogadores da sua comunidade."
        footer={
          <Button
            variant="secondary"
            className="full-width"
            disabled
            aria-describedby="cards-unavailable"
          >
            Cartas
          </Button>
        }
      >
        <Typography variant="text-s" tone="secondary">
          Os mesmos participantes, prontos para a próxima rodada.
        </Typography>
        <Typography id="cards-unavailable" variant="text-s" tone="secondary">
          Em breve.
        </Typography>
      </Card>
    </Screen>
  );
}
