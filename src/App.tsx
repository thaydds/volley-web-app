import { useState, useEffect } from 'react'
import './App.css'

function GearIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  )
}

function HomeScreen() {
  return (
    <div className="home-screen">
      <main className="home-main">
        <section className="home-top-section">
          <button className="card card--cartas">
            <span className="card__text">Cartas</span>
          </button>
        </section>

        <section className="home-center-section">
          <button className="card card--montar-time">
            <span className="card__text card__text--large">Montar o time!</span>
          </button>
        </section>

        <section className="home-bottom-section">
          <div className="bottom-actions">
            <button className="action-btn action-btn--ranking">
              <span>Ranking</span>
            </button>
            <button className="action-btn action-btn--partidas">
              <span>Partidas</span>
            </button>
            <button className="action-btn action-btn--settings" aria-label="Configurações">
              <GearIcon size={24} />
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}

function App() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <div className="app">
      <HomeScreen />

      {!isOnline && (
        <div className="offline-banner">
          📴 Você está offline. O app continua funcionando com dados em cache.
        </div>
      )}
    </div>
  )
}

export default App