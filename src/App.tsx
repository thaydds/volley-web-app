import LocalApp from './LocalApp';
import { SharedApp } from './shared/SharedApp';
import { Screen } from './components/Screen';
import { Typography } from '@beachsports/components';
// Production always sets the public API URL. Local preview remains available explicitly.
export default function App() {
  const url = import.meta.env.VITE_VOLLEY_API_URL;
  if (import.meta.env.PROD && !url)
    return (
      <div className="app">
        <Screen title="Serviço indisponível" badge="Volley">
          <Typography>
            Não foi possível iniciar o serviço compartilhado. Tente novamente mais tarde.
          </Typography>
        </Screen>
      </div>
    );
  return url ? <SharedApp apiUrl={url} /> : <LocalApp />;
}
