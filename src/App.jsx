import { useState, useEffect, useCallback, useRef } from 'react'
import QRCode from 'react-qr-code'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || ''

// Helper to generate unique offline IDs safely
function generateTempId(prefix = 'offline') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
}

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const loggedInUser = localStorage.getItem('currentUser')
      return loggedInUser ? JSON.parse(loggedInUser) : null
    } catch {
      return null
    }
  })

  const [currentView, setCurrentView] = useState(() => {
    const loggedInUser = localStorage.getItem('currentUser')
    return loggedInUser ? 'dashboard' : 'login'
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
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showQR, setShowQR] = useState(false)

  // References to avoid stale closures in listeners
  const offlineQueueRef = useRef(offlineQueue)
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

  // Sync Offline Queue
  const syncOfflineQueue = useCallback(async () => {
    const currentQueue = offlineQueueRef.current
    if (currentQueue.length === 0 || !navigator.onLine) return

    setIsSyncing(true)
    let successCount = 0
    const remainingQueue = []

    for (const item of currentQueue) {
      try {
        const response = await fetch(`${API_URL}/api/posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload)
        })

        if (response.ok) {
          const serverPost = await response.json()
          successCount++
          setPosts(prev => prev.map(p => (p.id === item.tempId ? serverPost : p)))
        } else {
          remainingQueue.push(item)
        }
      } catch (err) {
        console.error('Erro ao sincronizar item offline:', err)
        remainingQueue.push(item)
      }
    }

    setOfflineQueue(remainingQueue)
    setIsSyncing(false)

    if (successCount > 0) {
      addToast(`Sincronização concluída! ${successCount} item(ns) enviado(s) com sucesso.`, 'success')
    }
  }, [addToast])

  // Listen for online / offline network events and fetch initial data
  useEffect(() => {
    let isMounted = true

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
      setIsOnline(true)
      addToast('Conexão restabelecida! Você está online.', 'success')
      loadData()
      syncOfflineQueue()
    }

    const handleOffline = () => {
      setIsOnline(false)
      addToast('Conexão perdida. O aplicativo continuará funcionando no modo offline.', 'warning')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    loadData()

    return () => {
      isMounted = false
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [addToast, syncOfflineQueue])

  const clearForm = () => {
    setName('')
    setEmail('')
    setPassword('')
    setShowPassword(false)
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    
    if (!name || !email || !password) {
      addToast('Por favor, preencha todos os campos.', 'error')
      return
    }

    if (!isOnline) {
      addToast('Cadastro requer conexão com a internet. Conecte-se e tente novamente.', 'warning')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        addToast(data.error || 'Erro ao criar conta.', 'error')
        return
      }
      
      const newUser = { id: data.id, name: data.name, email: data.email }
      
      setUsers(prev => [...prev, newUser])
      setCurrentUser(newUser)
      localStorage.setItem('currentUser', JSON.stringify(newUser))
      
      clearForm()
      setCurrentView('dashboard')
      addToast('Conta criada com sucesso! Bem-vindo.', 'success')
    } catch {
      addToast('Erro no servidor ao tentar registrar.', 'error')
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
      
      const data = await response.json()
      
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
      addToast('Erro no servidor ao tentar logar.', 'error')
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
      const tempId = generateTempId('offline_post')
      const localPost = {
        ...newPostData,
        id: tempId,
        pendingSync: true
      }

      setPosts(prev => [localPost, ...prev])
      setOfflineQueue(prev => [...prev, { tempId, type: 'post', payload: newPostData }])
      addToast('Modo Offline: Desafio salvo localmente. Ele será enviado automaticamente ao reconectar!', 'warning')
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
    } catch {
      const tempId = generateTempId('offline_post')
      const localPost = {
        ...newPostData,
        id: tempId,
        pendingSync: true
      }
      setPosts(prev => [localPost, ...prev])
      setOfflineQueue(prev => [...prev, { tempId, type: 'post', payload: newPostData }])
      addToast('Sem conexão. O desafio foi guardado na fila offline e será enviado ao reconectar.', 'warning')
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
      const tempId = generateTempId('offline_reply')
      const localReply = {
        ...replyData,
        id: tempId,
        pendingSync: true
      }
      setPosts(prev => [localReply, ...prev])
      setOfflineQueue(prev => [...prev, { tempId, type: 'reply', payload: replyData }])
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
      const tempId = generateTempId('offline_reply')
      const localReply = {
        ...replyData,
        id: tempId,
        pendingSync: true
      }
      setPosts(prev => [localReply, ...prev])
      setOfflineQueue(prev => [...prev, { tempId, type: 'reply', payload: replyData }])
      addToast('Falha na rede. Resposta guardada offline e será sincronizada automaticamente.', 'warning')
    }
  }

  const switchView = (view) => {
    clearForm()
    setCurrentView(view)
  }

  return (
    <>
      {/* Global Status Bar / Indicator */}
      <div className={`status-indicator-bar ${isOnline ? 'status-online' : 'status-offline'}`}>
        <div className="status-indicator-content">
          <span className={`status-dot ${isOnline ? 'dot-online' : 'dot-offline'} ${isSyncing ? 'dot-syncing' : ''}`}></span>
          <span className="status-label">
            {isSyncing ? (
              <>Sincronizando dados...</>
            ) : isOnline ? (
              <>Online</>
            ) : (
              <>Modo Offline (dados salvos localmente)</>
            )}
          </span>

          {offlineQueue.length > 0 && (
            <span className="pending-badge">
              {offlineQueue.length} {offlineQueue.length === 1 ? 'pendência' : 'pendências'}
            </span>
          )}

          {isOnline && offlineQueue.length > 0 && !isSyncing && (
            <button type="button" className="btn-sync-now" onClick={syncOfflineQueue}>
              Sincronizar agora
            </button>
          )}
        </div>
      </div>

      {currentView === 'login' && (
        <div className="app-container">
          <div className="header">
            <div className="app-logo-badge">
              <span className="logo-sparkle">✦</span> Desafio X
            </div>
            <h2>Bem-vindo de volta</h2>
            <p>Faça login para acessar sua conta</p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Endereço de E-mail</label>
              <input 
                type="email" 
                placeholder="seu@email.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Senha</label>
              <div className="password-wrapper">
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button 
                  type="button" 
                  className="toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "Ocultar" : "Ver"}
                </button>
              </div>
            </div>
            <button type="submit" className="btn-primary">Entrar</button>
          </form>

          <div className="switch-mode">
            Ainda não tem uma conta? 
            <button type="button" onClick={() => switchView('register')}>Cadastre-se</button>
            
            <br/><br/>
            <button type="button" onClick={() => setShowQR(!showQR)} className="btn-secondary" style={{fontSize: '13px', padding: '10px 16px', display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer'}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
              Escanear QR Code
            </button>
            
            {showQR && (
              <div style={{ background: 'white', padding: '20px', borderRadius: '16px', margin: '20px auto 0', width: 'fit-content', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', animation: 'slideUp 0.3s ease-out' }}>
                <QRCode 
                  value={window.location.origin + window.location.pathname}
                  size={180} 
                />
                <p style={{color: '#0f172a', fontSize: '14px', marginTop: '16px', fontWeight: '600', marginBottom: '0'}}>
                  Aponte a câmera para<br/>instalar o app
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {currentView === 'register' && (
        <div className="app-container">
          <div className="header">
            <div className="app-logo-badge">
              <span className="logo-sparkle">✦</span> Desafio X
            </div>
            <h2>Criar Conta</h2>
            <p>Junte-se a nós hoje mesmo</p>
          </div>

          <form onSubmit={handleRegister}>
            <div className="form-group">
              <label>Nome Completo</label>
              <input 
                type="text" 
                placeholder="Seu nome" 
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Endereço de E-mail</label>
              <input 
                type="email" 
                placeholder="seu@email.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Senha</label>
              <div className="password-wrapper">
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="Crie uma senha forte" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button 
                  type="button" 
                  className="toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "Ocultar" : "Ver"}
                </button>
              </div>
            </div>
            <button type="submit" className="btn-primary">Cadastrar</button>
          </form>

          <div className="switch-mode">
            Já tem uma conta? 
            <button type="button" onClick={() => switchView('login')}>Faça Login</button>
          </div>
        </div>
      )}

      {currentView === 'dashboard' && currentUser && (
        <div className="app-container dashboard-container">
          <div className="dashboard-nav">
            <div className="dashboard-brand">
              <h1>Desafio X</h1>
              <div className={`nav-status-pill ${isOnline ? 'pill-online' : 'pill-offline'}`}>
                <span className={`status-dot-mini ${isOnline ? 'dot-online' : 'dot-offline'}`}></span>
                <span>{isOnline ? 'Online' : 'Offline'}</span>
              </div>
            </div>
            <div className="dashboard-user-info">
              <span className="user-welcome">Olá, <strong>{currentUser.name}</strong></span>
              <button onClick={handleLogout} className="btn-primary btn-danger">Sair</button>
            </div>
          </div>
          
          <div className="feed-layout">
             <div className="create-post-card">
               <div className="create-post-header">
                 <h3>Postar um Desafio</h3>
                 {!isOnline && (
                   <span className="offline-mode-tag">
                     💾 Salvando localmente (offline)
                   </span>
                 )}
               </div>

               <form onSubmit={handleCreatePost}>
                 <textarea
                   className="post-input"
                   placeholder={isOnline ? "Qual o seu desafio de hoje?" : "Qual o seu desafio de hoje? (será salvo offline)"}
                   value={postText}
                   onChange={(e) => setPostText(e.target.value)}
                 />
                 
                 {postMedia && (
                   <div className="media-preview">
                     {postMediaType === 'video' ? (
                       <video src={postMedia} controls />
                     ) : (
                       <img src={postMedia} alt="Preview" />
                     )}
                     <button type="button" onClick={() => {setPostMedia(null); setPostMediaType('')}}>Remover Mídia</button>
                   </div>
                 )}

                 <div className="post-actions">
                   <div className="upload-btn-wrapper">
                     <button type="button" className="btn-secondary">Adicionar Foto/Vídeo</button>
                     <input type="file" accept="image/*,video/*" onChange={handleMediaUpload} />
                   </div>
                   
                   <div className="tag-users-dropdown">
                     <span>Marcar amigos:</span>
                     <div className="tagged-users-list">
                       {users.filter(u => u.email !== currentUser.email).map(u => (
                         <label key={u.email} className="tag-checkbox">
                           <input 
                             type="checkbox" 
                             checked={taggedUsers.includes(u.email)}
                             onChange={(e) => {
                               if (e.target.checked) setTaggedUsers(prev => [...prev, u.email]);
                               else setTaggedUsers(prev => prev.filter(email => email !== u.email));
                             }}
                           />
                           {u.name}
                         </label>
                       ))}
                       {users.filter(u => u.email !== currentUser.email).length === 0 && (
                         <small className="no-users-hint">Nenhum outro usuário cadastrado.</small>
                       )}
                     </div>
                   </div>
                 </div>

                 <button type="submit" className="btn-primary">
                   {isOnline ? 'Publicar Desafio' : 'Salvar Desafio Offline'}
                 </button>
               </form>
             </div>

             <div className="timeline">
               <div className="timeline-header">
                 <h3>Linha do Tempo</h3>
                 {posts.length > 0 && (
                   <span className="cached-counter">
                     {posts.filter(p => !p.parentId).length} desafio(s)
                   </span>
                 )}
               </div>

               {posts.filter(p => !p.parentId).length === 0 ? (
                 <div className="empty-timeline-card">
                   <p className="empty-timeline">Nenhum desafio publicado ainda. Seja o primeiro!</p>
                 </div>
               ) : (
                 posts.filter(p => !p.parentId).map(post => {
                   const replies = posts.filter(p => String(p.parentId) === String(post.id));
                   return (
                     <div key={post.id} className={`post-card ${post.pendingSync ? 'post-pending' : ''}`}>
                       <div className="post-header">
                         <div className="author-info">
                           <div className="avatar">{post.author?.name ? post.author.name.charAt(0).toUpperCase() : '?'}</div>
                           <div className="author-details">
                             <div className="author-name-row">
                               <strong>{post.author?.name || 'Anônimo'}</strong>
                               {post.pendingSync && (
                                 <span className="badge-pending-sync" title="Este item está salvo no seu dispositivo e será sincronizado quando houver conexão">
                                   ⏳ Pendente de envio
                                 </span>
                               )}
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
                       
                       <p className="post-text">{post.text}</p>
                       
                       {post.media && (
                         <div className="post-media">
                           {post.mediaType === 'video' ? (
                              <video src={post.media} controls />
                           ) : (
                              <img src={post.media} alt="Post media" />
                           )}
                         </div>
                       )}

                       {/* Replies Section */}
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
                                       {reply.pendingSync && (
                                         <span className="badge-pending-sync-sm">⏳ Pendente</span>
                                       )}
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
                           className="reply-toggle-btn"
                           onClick={() => {
                             setActiveReplyId(activeReplyId === post.id ? null : post.id);
                             setReplyText('');
                             setReplyMedia(null);
                             setReplyMediaType('');
                           }}
                         >
                           {activeReplyId === post.id ? '✕ Cancelar' : `💬 Responder Desafio${replies.length > 0 ? ` (${replies.length})` : ''}`}
                         </button>

                         {activeReplyId === post.id && (
                           <form className="reply-form" onSubmit={(e) => handleCreateReply(e, post.id)}>
                             <textarea
                               className="post-input reply-input"
                               placeholder={isOnline ? "Escreva sua resposta ao desafio..." : "Escreva sua resposta (será salva offline)..."}
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
                                 <button type="button" onClick={() => { setReplyMedia(null); setReplyMediaType(''); }}>Remover</button>
                               </div>
                             )}
                             <div className="reply-actions">
                               <div className="upload-btn-wrapper">
                                 <button type="button" className="btn-secondary">📷 Foto/Vídeo</button>
                                 <input type="file" accept="image/*,video/*" onChange={handleReplyMediaUpload} />
                               </div>
                               <button type="submit" className="btn-primary reply-submit-btn">
                                 {isOnline ? 'Enviar Resposta' : 'Salvar Resposta Offline'}
                               </button>
                             </div>
                           </form>
                         )}
                       </div>
                     </div>
                   );
                 })
               )}
             </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <span>{toast.message}</span>
            <button onClick={() => removeToast(toast.id)} className="toast-close">
              &times;
            </button>
          </div>
        ))}
      </div>
    </>
  )
}

export default App


