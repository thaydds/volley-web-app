import { useState, useEffect } from 'react'
import './App.css'

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
      <header className="header">
        <div className="header-content">
          <h1>📱 PWA Template</h1>
          <div className={`status ${isOnline ? 'online' : 'offline'}`}>
            {isOnline ? '🟢 Online' : '🔴 Offline'}
          </div>
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <h2>Hello World PWA</h2>
          <p className="subtitle">
            Template mobile-first pronto para produção
          </p>
        </section>

        <section className="pwa-info">
          <h3>✨ Recursos incluídos</h3>
          <ul className="features-list">
            <li>📱 Instalável como app nativo</li>
            <li>🔄 Funciona offline (Service Worker)</li>
            <li>🔁 Atualização automática</li>
            <li>🌙 Dark mode automático</li>
            <li>⚡ Vite + React + TypeScript</li>
          </ul>
          <button className="btn-primary" onClick={() => alert('Use o menu do navegador → "Adicionar à tela inicial"')}>
            Como instalar
          </button>
        </section>

        <section className="tech-stack">
          <h3>Stack</h3>
          <div className="badges">
            <span className="badge">Vite</span>
            <span className="badge">React 18</span>
            <span className="badge">TypeScript</span>
            <span className="badge">Workbox</span>
            <span className="badge">ESLint</span>
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>PWA Template • Mobile-First • Feito com Vite + React</p>
      </footer>

      {!isOnline && (
        <div className="offline-banner">
          📴 Você está offline. O app continua funcionando com dados em cache.
        </div>
      )}
    </div>
  )
}

export default App