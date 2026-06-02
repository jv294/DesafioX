import { useState, useEffect } from 'react'
import QRCode from 'react-qr-code'
import './App.css'

function App() {
  const [currentView, setCurrentView] = useState('login')
  const [currentUser, setCurrentUser] = useState(null)
  const [users, setUsers] = useState([])
  
  // Toast notifications state
  const [toasts, setToasts] = useState([])

  // Posts state
  const [posts, setPosts] = useState([])
  const [postText, setPostText] = useState('')
  const [postMedia, setPostMedia] = useState(null)
  const [postMediaType, setPostMediaType] = useState('')
  const [taggedUsers, setTaggedUsers] = useState([])

  const addToast = (message, type = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    
    // Auto remove after 4 seconds
    setTimeout(() => {
      removeToast(id)
    }, 4000)
  }

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  // Load data on mount
  useEffect(() => {
    const loggedInUser = JSON.parse(localStorage.getItem('currentUser'))
    
    if (loggedInUser) {
      setCurrentUser(loggedInUser)
      setCurrentView('dashboard')
    }

    // Fetch posts from MongoDB via backend
    fetch('/api/posts')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setPosts(data)
      })
      .catch(err => console.error('Erro ao buscar posts:', err))

    // Fetch users from MongoDB via backend
    fetch('/api/users')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setUsers(data)
      })
      .catch(err => console.error('Erro ao buscar usuários:', err))
  }, [])

  // Input states
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showQR, setShowQR] = useState(false)

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

    try {
      const response = await fetch('/api/register', {
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
      
      // Update users list for tagging
      setUsers([...users, newUser])
      
      setCurrentUser(newUser)
      localStorage.setItem('currentUser', JSON.stringify(newUser))
      
      clearForm()
      setCurrentView('dashboard')
      addToast('Conta criada com sucesso! Bem-vindo.', 'success')
    } catch (err) {
      addToast('Erro no servidor ao tentar registrar.', 'error')
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()

    if (!email || !password) {
      addToast('Por favor, informe seu e-mail e senha.', 'error')
      return
    }

    try {
      const response = await fetch('/api/login', {
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
    } catch (err) {
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
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5000000) {
      addToast('Arquivo muito grande! Máximo 5MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPostMedia(reader.result);
      setPostMediaType(file.type.startsWith('video/') ? 'video' : 'image');
    };
    reader.readAsDataURL(file);
  }

  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!postText.trim() && !postMedia) {
      addToast('O post não pode estar vazio.', 'error');
      return;
    }
    
    const newPostData = {
      author: currentUser,
      text: postText,
      media: postMedia,
      mediaType: postMediaType,
      taggedUsers: users.filter(u => taggedUsers.includes(u.email)),
      timestamp: new Date().toISOString()
    };

    try {
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPostData)
      });
      const data = await response.json();
      
      if (!response.ok) {
        addToast(data.error || 'Erro ao publicar desafio.', 'error');
        return;
      }

      setPosts(prev => [data, ...prev]);
      addToast('Desafio publicado com sucesso!', 'success');

      setPostText('');
      setPostMedia(null);
      setPostMediaType('');
      setTaggedUsers([]);
    } catch (err) {
      addToast('Erro de conexão ao publicar desafio. O arquivo pode ser muito grande para o servidor.', 'error');
    }
  }

  const switchView = (view) => {
    clearForm()
    setCurrentView(view)
  }

  return (
    <>
      {currentView === 'login' && (
        <div className="app-container">
          <div className="header">
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
                  value={window.location.hostname === 'localhost' 
                    ? `http://${typeof __LOCAL_IP__ !== 'undefined' ? __LOCAL_IP__ : 'localhost'}:${window.location.port}`
                    : window.location.href} 
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
            <h1>Desafio X</h1>
            <button onClick={handleLogout} className="btn-primary btn-danger">Sair</button>
          </div>
          
          <div className="feed-layout">
             <div className="create-post-card">
               <h3>Postar um Desafio</h3>
               <form onSubmit={handleCreatePost}>
                 <textarea
                   className="post-input"
                   placeholder="Qual o seu desafio de hoje?"
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

                 <button type="submit" className="btn-primary">Publicar Desafio</button>
               </form>
             </div>

             <div className="timeline">
               <h3>Linha do Tempo</h3>
               {posts.length === 0 ? (
                 <p className="empty-timeline">Nenhum desafio publicado ainda. Seja o primeiro!</p>
               ) : (
                 posts.map(post => (
                   <div key={post.id} className="post-card">
                     <div className="post-header">
                       <div className="author-info">
                         <div className="avatar">{post.author.name.charAt(0).toUpperCase()}</div>
                         <div className="author-details">
                           <strong>{post.author.name}</strong>
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
                   </div>
                 ))
               )}
             </div>
          </div>
        </div>
      )}

      {/* Toast Configuration */}
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
