import { useState, useEffect, useCallback, useRef } from 'react'
import QRCode from 'react-qr-code'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || ''
const MAX_RETRIES = 5

// Helper to generate unique offline IDs safely
function generateTempId(prefix = 'offline') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
}

function Icon({ name, filled = false, className = '' }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={filled ? { fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" } : undefined}
    >
      {name}
    </span>
  )
}

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const loggedInUser = localStorage.getItem('currentUser')
      return loggedInUser && loggedInUser !== 'undefined' ? JSON.parse(loggedInUser) : null
    } catch {
      localStorage.removeItem('currentUser')
      return null
    }
  })

  const [currentView, setCurrentView] = useState(() => {
    try {
      const loggedInUser = localStorage.getItem('currentUser')
      const user = loggedInUser && loggedInUser !== 'undefined' ? JSON.parse(loggedInUser) : null
      return user ? 'dashboard' : 'login'
    } catch {
      return 'login'
    }
  })

  // Network & Offline Status
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  const [isSyncing, setIsSyncing] = useState(false)
  const [offlineQueue, setOfflineQueue] = useState(() => {
    try {
      const savedQueue = localStorage.getItem('desafiox_offline_queue')
      return savedQueue ? JSON.parse(savedQueue) : []
    } catch {
      return []
    }
  })

  // Toast notifications state
  const [toasts, setToasts] = useState([])

  // Cached Users & Posts State
  const [users, setUsers] = useState(() => {
    try {
      const cached = localStorage.getItem('desafiox_cached_users')
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })

  const [posts, setPosts] = useState(() => {
    try {
      const cached = localStorage.getItem('desafiox_cached_posts')
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })

  const [postText, setPostText] = useState('')
  const [postMedia, setPostMedia] = useState(null)
  const [postMediaType, setPostMediaType] = useState('')
  const [taggedUsers, setTaggedUsers] = useState([])

  // Reply states
  const [activeReplyId, setActiveReplyId] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [replyMedia, setReplyMedia] = useState(null)
  const [replyMediaType, setReplyMediaType] = useState('')

  // Input states
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [feedFilter, setFeedFilter] = useState('all')

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const addToast = useCallback((message, type = 'info') => {
    const id = generateTempId('toast')
    setToasts(prev => [...prev, { id, message, type }])
    
    setTimeout(() => {
      removeToast(id)
    }, 4500)
  }, [removeToast])

  const addToOfflineQueue = useCallback((payload, type = 'post') => {
    const tempId = generateTempId(`offline_${type}`)
    setOfflineQueue(prev => [...prev, { tempId, type, payload, timestamp: Date.now() }])

    const localItem = {
      ...payload,
      id: tempId,
      pendingSync: true,
    }
    setPosts(prev => [localItem, ...prev])
    addToast(`Modo Offline: ${type === 'post' ? 'Desafio' : 'Resposta'} salvo localmente. Será enviado ao reconectar.`, 'warning')
  }, [addToast])

  // References to avoid stale closures in listeners
  const offlineQueueRef = useRef(offlineQueue)
  const isSyncingRef = useRef(false)
  useEffect(() => {
    offlineQueueRef.current = offlineQueue
    try {
      localStorage.setItem('desafiox_offline_queue', JSON.stringify(offlineQueue))
    } catch (e) {
      console.warn('Falha ao salvar offline queue no localStorage:', e)
    }
  }, [offlineQueue])

  // Save cached posts to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('desafiox_cached_posts', JSON.stringify(posts))
    } catch (e) {
      console.warn('Falha ao salvar posts no cache local:', e)
    }
  }, [posts])

  // Save cached users to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('desafiox_cached_users', JSON.stringify(users))
    } catch (e) {
      console.warn('Falha ao salvar usuários no cache local:', e)
    }
  }, [users])

  // Sync Offline Queue
  const syncOfflineQueue = useCallback(async () => {
    const currentQueue = offlineQueueRef.current;
    if (currentQueue.length === 0 || !navigator.onLine || isSyncingRef.current) return;

    isSyncingRef.current = true;
    setIsSyncing(true);

    const queueCopy = [...currentQueue];
    const remaining = [];
    const failed = [];

    for (const item of queueCopy) {
      try {
        const response = await fetch(`${API_URL}/api/posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });

        if (response.ok) {
          const serverPost = await response.json();
          setPosts(prev => prev.map(p => (p.id === item.tempId ? serverPost : p)));
        } else {
          const updatedItem = { ...item, retries: (item.retries || 0) + 1 };
          if (updatedItem.retries >= MAX_RETRIES) {
            failed.push(updatedItem);
          } else {
            remaining.push(updatedItem);
          }
        }
      } catch (err) {
        console.error('Erro ao sincronizar:', err);
        const updatedItem = { ...item, retries: (item.retries || 0) + 1 };
        if (updatedItem.retries >= MAX_RETRIES) {
          failed.push(updatedItem);
        } else {
          remaining.push(updatedItem);
        }
      }
    }

    setOfflineQueue(remaining);
    setIsSyncing(false);
    isSyncingRef.current = false;

    const successCount = queueCopy.length - remaining.length - failed.length;
    if (successCount > 0) {
      addToast(`âœ… ${successCount} item(ns) sincronizados.`, 'success');
    }
    if (failed.length > 0) {
      localStorage.setItem('desafiox_failed_queue', JSON.stringify(failed));
      addToast(`âš ï¸ ${failed.length} item(ns) falharam permanentemente. Verifique e tente novamente.`, 'error');
    }
  }, [addToast]);

  // Listen for online / offline network events and fetch initial data
  useEffect(() => {
    let isMounted = true
    let onlineTimeout

    const loadData = async () => {
      if (!navigator.onLine) return

      try {
        const postsRes = await fetch(`${API_URL}/api/posts`)
        if (postsRes.ok && isMounted) {
          const postsData = await postsRes.json()
          if (!postsData.error && Array.isArray(postsData)) {
            setPosts(prev => {
              const pending = prev.filter(p => p.pendingSync)
              const serverPostIds = new Set(postsData.map(p => String(p.id)))
              const uniquePending = pending.filter(p => !serverPostIds.has(String(p.id)))
              return [...uniquePending, ...postsData]
            })
          }
        }
      } catch (err) {
        console.warn('Não foi possível atualizar posts do servidor:', err)
      }

      try {
        const usersRes = await fetch(`${API_URL}/api/users`)
        if (usersRes.ok && isMounted) {
          const usersData = await usersRes.json()
          if (!usersData.error && Array.isArray(usersData)) {
            setUsers(usersData)
          }
        }
      } catch (err) {
        console.warn('Não foi possível atualizar usuários do servidor:', err)
      }
    }

    const handleOnline = () => {
      clearTimeout(onlineTimeout)
      onlineTimeout = setTimeout(() => {
        setIsOnline(true);
        addToast('Conexão restabelecida! Você está online.', 'success');
        loadData();
        syncOfflineQueue()
      }, 300)
    }

    const handleOffline = () => {
      clearTimeout(onlineTimeout)
      setIsOnline(false);
      addToast('Conexão perdida. O aplicativo continuará funcionando no modo offline.', 'warning');
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    loadData()

    return () => {
      isMounted = false
      clearTimeout(onlineTimeout)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [addToast, syncOfflineQueue])

  const clearForm = () => {
    setName('')
    setEmail('')
    setPassword('')
    setBirthDate('')
    setShowPassword(false)
  }

  const calculateAge = (birthDate) => {
  const [year, month, day] = birthDate.split('-').map(Number)

  const today = new Date()

  let age = today.getFullYear() - year

  const birthdayNotReached =
    today.getMonth() + 1 < month ||
    (today.getMonth() + 1 === month && today.getDate() < day)

  if (birthdayNotReached) {
    age--
  }

  return age
}

const handleRegister = async (e) => {
  e.preventDefault()

  if (!name || !email || !password) {
    addToast('Por favor, preencha todos os campos.', 'error')
    return
  }

  if (!birthDate) {
    addToast('Por favor, informe sua data de nascimento.', 'error')
    return
  }

  const age = calculateAge(birthDate)

  if (age < 18) {
    addToast('Você deve ter pelo menos 18 anos para se registrar.', 'error')
    return
  }

  if (!isOnline) {
    addToast(
      'Cadastro requer conexão com a internet. Conecte-se e tente novamente.',
      'warning'
    )
    return
  }

  try {
    const response = await fetch(`${API_URL}/api/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        email,
        password,
        birthDate
      })
    })

    const contentType = response.headers.get('content-type')

    const data = contentType && contentType.includes('application/json')
      ? await response.json()
      : {
          error: `Erro ${response.status}: Servidor não retornou resposta válida.`
        }

    if (!response.ok) {
      addToast(data.error || 'Erro ao criar conta.', 'error')
      return
    }

    const newUser = {
      id: data.id,
      name: data.name,
      email: data.email
    }

    setUsers(prev => [...prev, newUser])
    setCurrentUser(newUser)
    localStorage.setItem('currentUser', JSON.stringify(newUser))

    clearForm()
    setCurrentView('dashboard')

    addToast('Conta criada com sucesso! Bem-vindo.', 'success')
  } catch {
    addToast(
      'Falha ao conectar com o servidor. Verifique se o backend está rodando.',
      'error'
    )
  }
}

  const handleLogin = async (e) => {
    e.preventDefault()

    if (!email || !password) {
      addToast('Por favor, informe seu e-mail e senha.', 'error')
      return
    }

    if (!isOnline) {
      const cachedUser = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase())
      if (cachedUser) {
        setCurrentUser(cachedUser)
        localStorage.setItem('currentUser', JSON.stringify(cachedUser))
        clearForm()
        setCurrentView('dashboard')
        addToast(`Entrando em modo offline como ${cachedUser.name}.`, 'info')
        return
      } else {
        addToast('Você está offline. Para acessar novas contas, conecte-se à internet.', 'warning')
        return
      }
    }

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      
      const contentType = response.headers.get('content-type')
      const data = contentType && contentType.includes('application/json')
        ? await response.json()
        : { error: `Erro ${response.status}: Servidor não retornou resposta válida.` }
      
      if (!response.ok) {
        addToast(data.error || 'E-mail ou senha incorretos.', 'error')
        return
      }

      const loggedUser = { id: data.id, name: data.name, email: data.email }
      setCurrentUser(loggedUser)
      localStorage.setItem('currentUser', JSON.stringify(loggedUser))
      clearForm()
      setCurrentView('dashboard')
      addToast('Login realizado com sucesso!', 'success')
    } catch {
      addToast('Falha ao conectar com o servidor. Verifique se o backend está rodando.', 'error')
    }
  }

  const handleLogout = () => {
    setCurrentUser(null)
    localStorage.removeItem('currentUser')
    setCurrentView('login')
    addToast('Você saiu do sistema.', 'info')
  }

  const handleMediaUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    if (file.size > 5000000) {
      addToast('Arquivo muito grande! Máximo 5MB.', 'error')
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      setPostMedia(reader.result)
      setPostMediaType(file.type.startsWith('video/') ? 'video' : 'image')
    }
    reader.readAsDataURL(file)
  }

  const handleReplyMediaUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    if (file.size > 5000000) {
      addToast('Arquivo muito grande! Máximo 5MB.', 'error')
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      setReplyMedia(reader.result)
      setReplyMediaType(file.type.startsWith('video/') ? 'video' : 'image')
    }
    reader.readAsDataURL(file)
  }

  const handleCreatePost = async (e) => {
    e.preventDefault()
    if (!postText.trim() && !postMedia) {
      addToast('O post não pode estar vazio.', 'error')
      return
    }
    
    const newPostData = {
      author: currentUser,
      text: postText,
      media: postMedia,
      mediaType: postMediaType,
      taggedUsers: users.filter(u => taggedUsers.includes(u.email)),
      timestamp: new Date().toISOString()
    }

    setPostText('')
    setPostMedia(null)
    setPostMediaType('')
    setTaggedUsers([])

    if (!navigator.onLine) {
      addToOfflineQueue(newPostData)
      addToast('Modo Offline: Desafio salvo localmente...', 'warning')
      setCurrentView('dashboard')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPostData)
      })
      const data = await response.json()
      
      if (!response.ok) {
        addToast(data.error || 'Erro ao publicar desafio.', 'error')
        return
      }

      setPosts(prev => [data, ...prev])
      addToast('Desafio publicado com sucesso!', 'success')
      setCurrentView('dashboard')
    } catch {
      addToOfflineQueue(newPostData, 'post')
      addToast('Sem conexão. O desafio foi guardado na fila offline e será enviado ao reconectar.', 'warning')
      setCurrentView('dashboard')
    }
  }

  const handleCreateReply = async (e, parentId) => {
    e.preventDefault()
    if (!replyText.trim() && !replyMedia) {
      addToast('A resposta não pode estar vazia.', 'error')
      return
    }

    const replyData = {
      author: currentUser,
      text: replyText,
      media: replyMedia,
      mediaType: replyMediaType,
      taggedUsers: [],
      timestamp: new Date().toISOString(),
      parentId
    }

    setReplyText('')
    setReplyMedia(null)
    setReplyMediaType('')
    setActiveReplyId(null)

    if (!navigator.onLine) {
      addToOfflineQueue(replyData, 'reply')
      addToast('Modo Offline: Resposta salva localmente. Será enviada assim que reconectar!', 'warning')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(replyData)
      })
      const data = await response.json()

      if (!response.ok) {
        addToast(data.error || 'Erro ao enviar resposta.', 'error')
        return
      }

      setPosts(prev => [data, ...prev])
      addToast('Resposta enviada!', 'success')
    } catch {
      addToOfflineQueue(replyData, 'reply')
      addToast('Falha na rede. Resposta guardada offline e será sincronizada automaticamente.', 'warning')
    }
  }

  const switchView = (view) => {
    clearForm()
    setShowQR(false)
    setCurrentView(view)
  }

  const openAppView = (view) => {
    setCurrentView(view)
    setActiveReplyId(null)
  }

  const comingSoon = (area) => {
    addToast(`${area} entra nas próximas atualizações. Por enquanto use o feed e o criar desafio.`, 'info')
  }

  const parentPosts = posts.filter(p => !p.parentId)
  const visiblePosts = parentPosts.filter(post => {
    if (feedFilter === 'mine') return post.author?.email === currentUser?.email
    if (feedFilter === 'media') return Boolean(post.media)
    return true
  })

  const telemetryLabel = isSyncing ? 'Sincronizando' : isOnline ? 'Online' : 'Offline'
  const isAppView = Boolean(currentUser)

  return (
    <div className="app-root">
      <div className={`phone-frame ${isAppView ? 'app-frame' : 'auth-frame'}`}>
        <div className="ambient ambient-a" />
        <div className="ambient ambient-b" />

        {!currentUser && (currentView === 'login' || currentView !== 'register') && (
          <section className="auth-screen login-screen">
            <header className="auth-top">
              <div className={`telemetry ${isOnline ? 'on' : 'off'}`}>
                <span className={`status-dot ${isOnline ? 'dot-online' : 'dot-offline'}`}></span>
                <span>{isOnline ? 'Online' : 'Offline'}</span>
              </div>
            </header>

            <div className="auth-body login-body">
              <div className="login-hero">
                <div className="login-brand">
                  <span className="logo-mark glow"><Icon name="bolt" filled /></span>
                  <h1 className="login-title">
                    DESAFIO <span>X</span>
                  </h1>
                </div>
                <h2>Entre na Arena</h2>
                <p>Lance desafios, acompanhe o feed e responda a galera.</p>
              </div>

              <form className="auth-form" onSubmit={handleLogin}>
                <label className="field">
                  <span>E-mail</span>
                  <div className="arena-input">
                    <Icon name="alternate_email" />
                    <input
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="username"
                    />
                  </div>
                </label>

                <label className="field">
                  <span>Senha</span>
                  <div className="arena-input">
                    <Icon name="lock" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                    <button type="button" className="icon-btn" onClick={() => setShowPassword(!showPassword)} aria-label="Mostrar senha">
                      <Icon name={showPassword ? 'visibility_off' : 'visibility'} />
                    </button>
                  </div>
                </label>

                <div className="auth-meta">
                  <span className="secure-chip">
                    <Icon name="verified_user" filled /> Sessão segura
                  </span>
                </div>

                <button type="submit" className="btn-primary btn-fire">
                  Entrar <Icon name="bolt" filled />
                </button>
              </form>

              <div className="auth-divider">
                <span>ou continue com</span>
              </div>

              <button type="button" className="btn-secondary qr-trigger" onClick={() => setShowQR(!showQR)}>
                <Icon name="qr_code_scanner" />
                {showQR ? 'Ocultar QR Code' : 'Escanear QR Code'}
              </button>

              {showQR && (
                <div className="qr-panel">
                  <QRCode value={window.location.origin + window.location.pathname} size={180} />
                  <p>Aponte a câmera para<br />instalar o app</p>
                </div>
              )}
            </div>

            <footer className="auth-foot login-foot">
              <p className="switch-mode">
                Ainda não tem conta?
                <button type="button" onClick={() => switchView('register')}>Cadastre-se</button>
              </p>
              <div className="legal-row">
                <span className="age-badge">18+</span>
                <span>Apenas para maiores de 18 anos</span>
              </div>
            </footer>
          </section>
        )}

        {!currentUser && currentView === 'register' && (
          <section className="auth-screen register-screen">
            <header className="auth-top">
              <div className={`telemetry ${isOnline ? 'on' : 'off'}`}>
                <span className={`status-dot ${isOnline ? 'dot-online' : 'dot-offline'}`}></span>
                <span>{isOnline ? 'Online' : 'Offline'}</span>
              </div>
              <button type="button" className="text-link" onClick={() => switchView('login')}>
                <Icon name="arrow_back" /> Entrar
              </button>
            </header>

            <div className="auth-body">
              <div className="brand-lockup">
                <span className="logo-mark glow"><Icon name="bolt" filled /></span>
                <span className="logo-wordmark">DESAFIO X</span>
              </div>
              <h1>Crie sua Conta</h1>
              <p className="auth-subtitle">Entre na arena, publique desafios e responda no feed.</p>

              <div className="age-banner">
                <span className="age-badge">18+</span>
                Cadastro permitido apenas para maiores de 18 anos.
              </div>

              <form className="auth-form" onSubmit={handleRegister}>
                <label className="field">
                  <span>Nome completo</span>
                  <div className="arena-input">
                    <Icon name="person" />
                    <input
                      type="text"
                      placeholder="Seu nome ou como quer ser chamado"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                </label>

                <label className="field">
                  <span>E-mail</span>
                  <div className="arena-input">
                    <Icon name="mail" />
                    <input
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </label>

                <label className="field">
                  <span>Data de nascimento</span>
                  <div className="arena-input">
                    <Icon name="calendar_today" />
                    <input
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      required
                    />
                  </div>
                </label>

                <label className="field">
                  <span>Senha de acesso</span>
                  <div className="arena-input">
                    <Icon name="key" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Crie uma senha segura"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button type="button" className="icon-btn" onClick={() => setShowPassword(!showPassword)} aria-label="Mostrar senha">
                      <Icon name={showPassword ? 'visibility_off' : 'visibility'} />
                    </button>
                  </div>
                </label>

                <button type="submit" className="btn-primary btn-fire">
                  Cadastrar <Icon name="arrow_forward" />
                </button>
              </form>

              <p className="switch-mode">
                Já tem uma conta?
                <button type="button" onClick={() => switchView('login')}>Entrar</button>
              </p>
            </div>
          </section>
        )}
        {currentUser && (
          <>
            <header className="top-bar">
              <div className="brand-lockup compact">
                <span className="logo-mark"><Icon name="bolt" filled /></span>
                <div>
                  <span className="logo-wordmark">Desafio X</span>
                  <span className="arena-caption">Arena de desafios</span>
                </div>
              </div>
              <div className="top-bar-actions">
                <div className={`telemetry ${isOnline ? 'on' : 'off'} ${isSyncing ? 'sync' : ''}`}>
                  <span className={`status-dot ${isSyncing ? 'dot-syncing' : isOnline ? 'dot-online' : 'dot-offline'}`}></span>
                  <span>{telemetryLabel}</span>
                </div>
                {offlineQueue.length > 0 && (
                  <span className="pending-badge">{offlineQueue.length}</span>
                )}
                {isOnline && offlineQueue.length > 0 && !isSyncing && (
                  <button type="button" className="btn-sync-now" onClick={syncOfflineQueue}>Sync</button>
                )}
              </div>
            </header>

            <main className="app-main">
              {(currentView === 'dashboard' || currentView === 'login') && (
                <>
                  <section className="filter-row" aria-label="Filtros do feed">
                    <button type="button" className={`chip ${feedFilter === 'all' ? 'active' : ''}`} onClick={() => setFeedFilter('all')}>
                      <Icon name="local_fire_department" filled={feedFilter === 'all'} /> Todos
                    </button>
                    <button type="button" className={`chip ${feedFilter === 'media' ? 'active' : ''}`} onClick={() => setFeedFilter('media')}>
                      <Icon name="photo_camera" /> Com mídia
                    </button>
                    <button type="button" className={`chip ${feedFilter === 'mine' ? 'active' : ''}`} onClick={() => setFeedFilter('mine')}>
                      <Icon name="person" /> Meus
                    </button>
                  </section>

                  {visiblePosts.length === 0 ? (
                    <div className="empty-timeline-card">
                      <Icon name="swords" />
                      <p className="empty-timeline">Nenhum desafio por aqui. Toque no raio para publicar o primeiro.</p>
                    </div>
                  ) : (
                    visiblePosts.map(post => {
                      const replies = posts.filter(p => String(p.parentId) === String(post.id))
                      return (
                        <article key={post.id} className={`post-card ${post.pendingSync ? 'post-pending' : ''}`}>
                          <div className="post-header">
                            <div className="author-info">
                              <div className="avatar">{post.author?.name ? post.author.name.charAt(0).toUpperCase() : '?'}</div>
                              <div className="author-details">
                                <div className="author-name-row">
                                  <strong>{post.author?.name || 'Anônimo'}</strong>
                                  {post.pendingSync && <span className="badge-pending-sync">Pendente</span>}
                                </div>
                                <span className="timestamp">{new Date(post.timestamp).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>

                          {post.taggedUsers && post.taggedUsers.length > 0 && (
                            <div className="post-tags">
                              <strong>Com:</strong> {post.taggedUsers.map(u => u.name).join(', ')}
                            </div>
                          )}

                          {post.text && <p className="post-text">{post.text}</p>}

                          {post.media && (
                            <div className="post-media">
                              {post.mediaType === 'video' ? (
                                <video src={post.media} controls />
                              ) : (
                                <img src={post.media} alt="Mídia do desafio" />
                              )}
                            </div>
                          )}

                          <div className="replies-section">
                            {replies.length > 0 && (
                              <div className="replies-list">
                                {replies.map(reply => (
                                  <div key={reply.id} className={`reply-card ${reply.pendingSync ? 'reply-pending' : ''}`}>
                                    <div className="reply-author">
                                      <div className="avatar avatar-sm">{reply.author?.name ? reply.author.name.charAt(0).toUpperCase() : '?'}</div>
                                      <div className="author-details">
                                        <div className="author-name-row">
                                          <strong>{reply.author?.name || 'Anônimo'}</strong>
                                          {reply.pendingSync && <span className="badge-pending-sync-sm">Pendente</span>}
                                        </div>
                                        <span className="timestamp">{new Date(reply.timestamp).toLocaleString()}</span>
                                      </div>
                                    </div>
                                    {reply.text && <p className="post-text">{reply.text}</p>}
                                    {reply.media && (
                                      <div className="post-media">
                                        {reply.mediaType === 'video' ? (
                                          <video src={reply.media} controls />
                                        ) : (
                                          <img src={reply.media} alt="Resposta" />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            <button
                              type="button"
                              className="btn-primary reply-cta"
                              onClick={() => {
                                setActiveReplyId(activeReplyId === post.id ? null : post.id)
                                setReplyText('')
                                setReplyMedia(null)
                                setReplyMediaType('')
                              }}
                            >
                              <Icon name={activeReplyId === post.id ? 'close' : 'reply'} />
                              {activeReplyId === post.id ? 'Cancelar' : `Responder${replies.length > 0 ? ` (${replies.length})` : ''}`}
                            </button>

                            {activeReplyId === post.id && (
                              <form className="reply-form" onSubmit={(e) => handleCreateReply(e, post.id)}>
                                <textarea
                                  className="post-input reply-input"
                                  placeholder={isOnline ? 'Escreva sua resposta ao desafio...' : 'Escreva sua resposta (será salva offline)...'}
                                  value={replyText}
                                  onChange={(e) => setReplyText(e.target.value)}
                                />
                                {replyMedia && (
                                  <div className="media-preview">
                                    {replyMediaType === 'video' ? (
                                      <video src={replyMedia} controls />
                                    ) : (
                                      <img src={replyMedia} alt="Preview" />
                                    )}
                                    <button type="button" onClick={() => { setReplyMedia(null); setReplyMediaType('') }}>Remover</button>
                                  </div>
                                )}
                                <div className="reply-actions">
                                  <div className="upload-btn-wrapper">
                                    <button type="button" className="btn-secondary">Foto/Vídeo</button>
                                    <input type="file" accept="image/*,video/*" onChange={handleReplyMediaUpload} />
                                  </div>
                                  <button type="submit" className="btn-primary reply-submit-btn">
                                    {isOnline ? 'Enviar' : 'Salvar offline'}
                                  </button>
                                </div>
                              </form>
                            )}
                          </div>
                        </article>
                      )
                    })
                  )}
                </>
              )}

              {currentView === 'create' && (
                <form className="create-screen" onSubmit={handleCreatePost}>
                  <div className="create-top">
                    <button type="button" className="icon-round" onClick={() => openAppView('dashboard')} aria-label="Fechar">
                      <Icon name="close" />
                    </button>
                    <h1>Novo desafio</h1>
                  </div>

                  <section className="create-block">
                    <label className="block-label" htmlFor="challenge-title">Meta do desafio</label>
                    <textarea
                      id="challenge-title"
                      className="post-input"
                      placeholder={isOnline ? 'Qual o seu desafio de hoje?' : 'Qual o seu desafio de hoje? (será salvo offline)'}
                      value={postText}
                      onChange={(e) => setPostText(e.target.value)}
                    />
                  </section>

                  <section className="create-block">
                    <div className="block-label-row">
                      <span className="block-label">Foto ou vídeo</span>
                      <span className="hint">Até 5MB</span>
                    </div>
                    {postMedia && (
                      <div className="media-preview">
                        {postMediaType === 'video' ? (
                          <video src={postMedia} controls />
                        ) : (
                          <img src={postMedia} alt="Preview" />
                        )}
                        <button type="button" onClick={() => { setPostMedia(null); setPostMediaType('') }}>Remover</button>
                      </div>
                    )}
                    <div className="upload-drop">
                      <Icon name="cloud_upload" />
                      <p>Enviar foto ou vídeo</p>
                      <div className="upload-btn-wrapper full">
                        <button type="button" className="btn-secondary">Escolher arquivo</button>
                        <input type="file" accept="image/*,video/*" onChange={handleMediaUpload} />
                      </div>
                    </div>
                  </section>

                  <section className="create-block">
                    <span className="block-label">Marcar amigos</span>
                    <div className="tagged-users-list">
                      {users.filter(u => u.email !== currentUser.email).map(u => (
                        <label key={u.email} className={`tag-chip ${taggedUsers.includes(u.email) ? 'selected' : ''}`}>
                          <input
                            type="checkbox"
                            checked={taggedUsers.includes(u.email)}
                            onChange={(e) => {
                              if (e.target.checked) setTaggedUsers(prev => [...prev, u.email])
                              else setTaggedUsers(prev => prev.filter(email => email !== u.email))
                            }}
                          />
                          <span className="avatar avatar-sm">{u.name.charAt(0).toUpperCase()}</span>
                          {u.name}
                        </label>
                      ))}
                      {users.filter(u => u.email !== currentUser.email).length === 0 && (
                        <small className="no-users-hint">Nenhum outro usuário cadastrado.</small>
                      )}
                    </div>
                  </section>

                  <button type="submit" className="btn-primary sticky-cta">
                    <Icon name="bolt" filled />
                    {isOnline ? 'Publicar desafio' : 'Salvar desafio offline'}
                  </button>
                </form>
              )}

              {currentView === 'profile' && (
                <section className="profile-screen">
                  <div className="profile-hero">
                    <div className="avatar xl">{currentUser.name.charAt(0).toUpperCase()}</div>
                    <h1>{currentUser.name}</h1>
                    <p>{currentUser.email}</p>
                  </div>
                  <button type="button" className="btn-secondary qr-trigger" onClick={() => setShowQR(!showQR)}>
                    <Icon name="qr_code_2" />
                    {showQR ? 'Ocultar QR Code' : 'QR Code do app'}
                  </button>
                  {showQR && (
                    <div className="qr-panel">
                      <QRCode value={window.location.origin + window.location.pathname} size={180} />
                      <p>Aponte a câmera para<br />instalar o app</p>
                    </div>
                  )}
                  <button type="button" className="btn-primary btn-danger" onClick={handleLogout}>Sair</button>
                </section>
              )}
            </main>

            <nav className="bottom-nav" aria-label="Navegação principal">
              <div className="bottom-nav-inner">
                <button
                  type="button"
                  className={`nav-item ${(currentView === 'dashboard' || currentView === 'login') ? 'active' : ''}`}
                  onClick={() => openAppView('dashboard')}
                >
                  <Icon name="swords" filled={currentView === 'dashboard' || currentView === 'login'} />
                  <span>Arena</span>
                </button>
                <button type="button" className="nav-item" onClick={() => comingSoon('Amigos')}>
                  <Icon name="group" />
                  <span>Amigos</span>
                </button>
                <button type="button" className="nav-item nav-fab-wrap" onClick={() => openAppView('create')} aria-label="Criar desafio">
                  <span className="nav-fab"><Icon name="bolt" filled /></span>
                  <span>Desafiar</span>
                </button>
                <button type="button" className="nav-item" onClick={() => comingSoon('Parties')}>
                  <Icon name="groups" />
                  <span>Parties</span>
                </button>
                <button
                  type="button"
                  className={`nav-item ${currentView === 'profile' ? 'active' : ''}`}
                  onClick={() => openAppView('profile')}
                >
                  <Icon name="person" filled={currentView === 'profile'} />
                  <span>Perfil</span>
                </button>
              </div>
            </nav>
          </>
        )}
      </div>

      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <span>{toast.message}</span>
            <button onClick={() => removeToast(toast.id)} className="toast-close">&times;</button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
