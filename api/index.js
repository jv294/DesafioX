import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DBNAME = process.env.MONGODB_DBNAME || 'app';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

let client = null;
let clientPromise = null;
let usersCollection = null;
let postsCollection = null;
let subscriptionsCollection = null;
let notificationsCollection = null;

async function ensureDbConnected() {
  const rawUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_URL || process.env.DATABASE_URL;
  const uri = rawUri ? rawUri.trim() : null;
  
  if (!uri) {
    throw new Error('MONGODB_URI não está configurada nas Variáveis de Ambiente da Vercel. Adicione em Project Settings > Environment Variables e faça um Redeploy.');
  }

  if (!client) {
    client = new MongoClient(uri);
    clientPromise = client.connect().catch(err => {
      // Se a conexão falhar, reseta o client para permitir novas tentativas
      client = null;
      clientPromise = null;
      throw err;
    });
  }

  try {
    await clientPromise;
  } catch (err) {
    client = null;
    clientPromise = null;
    throw new Error('Falha ao conectar no MongoDB Atlas: ' + err.message + ' (Verifique se o usuário/senha estão corretos e se o IP 0.0.0.0/0 está liberado no Network Access)');
  }

  if (!usersCollection || !postsCollection) {
    const dbName = process.env.MONGODB_DBNAME || 'app';
    const db = client.db(dbName);
    usersCollection = db.collection('users');
    postsCollection = db.collection('posts');
    subscriptionsCollection = db.collection('subscriptions');
    notificationsCollection = db.collection('notifications');
    try {
      await usersCollection.createIndex({ email: 1 }, { unique: true });
    } catch {
      // Índice já existe ou ignorar erro transitório
    }
  }
}

// Middleware para garantir conexão com banco de dados antes de processar qualquer rota
app.use(async (req, res, next) => {
  try {
    await ensureDbConnected();
    next();
  } catch (err) {
    console.error('Erro de conexão com o banco de dados:', err);
    res.status(500).json({ error: 'Erro no servidor: ' + err.message });
  }
});

// Register User
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Por favor, preencha todos os campos.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await usersCollection.insertOne({ name, email, password: hashedPassword });
    res.status(201).json({ id: result.insertedId, name, email, avatar: null });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado.' });
    }
    res.status(500).json({ error: err.message });
  }
});

function toPublicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar || null
  };
}

// Login User
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Por favor, informe seu e-mail e senha.' });
  }

  try {
    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    res.json(toPublicUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const users = await usersCollection.find({}, { projection: { _id: 1, name: 1, email: 1, avatar: 1 } }).toArray();
    res.json(users.map(toPublicUser));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update profile (name and avatar)
app.put('/api/profile', async (req, res) => {
  const { email, name, avatar } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'E-mail do usuário não informado.' });
  }

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) {
    return res.status(400).json({ error: 'Informe um nome válido.' });
  }

  if (avatar && typeof avatar === 'string' && avatar.length > 2_500_000) {
    return res.status(400).json({ error: 'Imagem de perfil muito grande. Tente outra foto.' });
  }

  try {
    const result = await usersCollection.findOneAndUpdate(
      { email },
      { $set: { name: trimmedName, avatar: avatar || null } },
      { returnDocument: 'after' }
    );

    const updated = result?.value || result;
    if (!updated) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    res.json(toPublicUser(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all posts
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await postsCollection.find({}).sort({ timestamp: -1 }).toArray();
    res.json(posts.map(post => ({
      id: post._id,
      parentId: post.parentId || null,
      author: post.author,
      text: post.text,
      media: post.media,
      mediaType: post.mediaType,
      taggedUsers: post.taggedUsers,
      timestamp: post.timestamp
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a post
app.post('/api/posts', async (req, res) => {
  const { author, text, media, mediaType, taggedUsers, timestamp, parentId } = req.body;
  if (!author) {
    return res.status(400).json({ error: 'Autor do post não fornecido.' });
  }

  try {
    const newPost = {
      parentId: parentId || null,
      author,
      text: text || '',
      media: media || null,
      mediaType: mediaType || '',
      taggedUsers: taggedUsers || [],
      timestamp: timestamp || new Date().toISOString()
    };
    const result = await postsCollection.insertOne(newPost);

    // Disparar notificações para usuários marcados (menções) e assinantes
    try {
      const authorEmail = (author.email || '').trim().toLowerCase();
      if (authorEmail && notificationsCollection) {
        const notificationsToInsert = [];
        const notifiedEmails = new Set();

        // 1. Identificar usuários marcados (taggedUsers)
        const taggedEmails = new Set();
        if (Array.isArray(taggedUsers)) {
          for (const tu of taggedUsers) {
            const email = (typeof tu === 'string' ? tu : tu?.email || '').trim().toLowerCase();
            if (email && email !== authorEmail) {
              taggedEmails.add(email);
            }
          }
        }

        // Também detectar menções por @ no texto (ex: @email ou @nome)
        if (text && typeof text === 'string' && text.includes('@') && usersCollection) {
          try {
            const allUsers = await usersCollection.find({}, { projection: { email: 1, name: 1 } }).toArray();
            for (const u of allUsers) {
              if (!u.email || u.email.toLowerCase() === authorEmail) continue;
              const uEmail = u.email.toLowerCase();
              const uNameClean = (u.name || '').trim().toLowerCase().replace(/\s+/g, '');
              const textClean = text.toLowerCase().replace(/\s+/g, '');
              if (text.toLowerCase().includes(`@${uEmail}`) || (uNameClean && textClean.includes(`@${uNameClean}`))) {
                taggedEmails.add(uEmail);
              }
            }
          } catch (mentionErr) {
            console.warn('Erro ao checar menções no texto:', mentionErr);
          }
        }

        // Criar notificação para cada usuário marcado
        for (const taggedEmail of taggedEmails) {
          notificationsToInsert.push({
            recipientEmail: taggedEmail,
            senderEmail: authorEmail,
            senderName: author.name || 'Alguém',
            senderAvatar: author.avatar || null,
            postId: String(result.insertedId),
            postText: (text || '').trim().slice(0, 100),
            type: 'mention',
            message: `${author.name || 'Um amigo'} marcou você em um ${parentId ? 'comentário' : 'desafio'}!`,
            read: false,
            timestamp: new Date().toISOString()
          });
          notifiedEmails.add(taggedEmail);
        }

        // 2. Criar notificação para assinantes que acompanham o autor (caso ainda não tenham sido marcados)
        if (subscriptionsCollection) {
          const subscribers = await subscriptionsCollection.find({ targetUserEmail: authorEmail }).toArray();
          for (const sub of subscribers) {
            const subEmail = (sub.subscriberEmail || '').trim().toLowerCase();
            if (subEmail && subEmail !== authorEmail && !notifiedEmails.has(subEmail)) {
              notificationsToInsert.push({
                recipientEmail: subEmail,
                senderEmail: authorEmail,
                senderName: author.name || 'Alguém',
                senderAvatar: author.avatar || null,
                postId: String(result.insertedId),
                postText: (text || '').trim().slice(0, 100),
                type: parentId ? 'reply' : 'post',
                message: `${author.name || 'Um usuário'} publicou ${parentId ? 'uma resposta' : 'um novo desafio'}!`,
                read: false,
                timestamp: new Date().toISOString()
              });
              notifiedEmails.add(subEmail);
            }
          }
        }

        if (notificationsToInsert.length > 0) {
          await notificationsCollection.insertMany(notificationsToInsert);
        }
      }
    } catch (notifErr) {
      console.warn('Falha silenciosa ao registrar notificações:', notifErr.message);
    }

    res.status(201).json({ id: result.insertedId, ...newPost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a post (only author can delete their own post)
app.delete('/api/posts/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'ID da postagem não fornecido.' });
  }

  const requesterEmail = (
    req.body?.userEmail ||
    req.query?.userEmail ||
    req.headers['x-user-email'] ||
    req.body?.authorEmail ||
    req.body?.author?.email ||
    ''
  ).toString().trim().toLowerCase();

  const requesterId = (
    req.body?.userId ||
    req.query?.userId ||
    req.headers['x-user-id'] ||
    req.body?.author?.id ||
    ''
  ).toString().trim();

  if (!requesterEmail && !requesterId) {
    return res.status(401).json({ error: 'Identificação do usuário não fornecida.' });
  }

  try {
    let queryId;
    if (ObjectId.isValid(id)) {
      queryId = new ObjectId(id);
    } else {
      queryId = id;
    }

    const post = await postsCollection.findOne({
      $or: [{ _id: queryId }, { _id: id }]
    });

    if (!post) {
      return res.status(404).json({ error: 'Postagem não encontrada.' });
    }

    let postAuthorEmail = '';
    let postAuthorId = '';
    if (typeof post.author === 'string') {
      postAuthorEmail = post.author.trim().toLowerCase();
    } else if (post.author && typeof post.author === 'object') {
      postAuthorEmail = (post.author.email || '').toString().trim().toLowerCase();
      postAuthorId = (post.author.id || post.author._id || '').toString().trim();
    }

    const isAuthor =
      (Boolean(postAuthorEmail) && Boolean(requesterEmail) && postAuthorEmail === requesterEmail) ||
      (Boolean(postAuthorId) && Boolean(requesterId) && postAuthorId === requesterId);

    if (!isAuthor) {
      return res.status(403).json({ error: 'Você só pode excluir suas próprias postagens.' });
    }

    await postsCollection.deleteOne({ _id: post._id });

    // Se for post principal, remove também as respostas vinculadas
    await postsCollection.deleteMany({
      $or: [
        { parentId: id },
        { parentId: String(post._id) },
        ...(ObjectId.isValid(id) ? [{ parentId: new ObjectId(id) }] : [])
      ]
    });

    res.json({ message: 'Postagem excluída com sucesso.', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Alternar inscrição de notificações para um usuário específico
app.post('/api/notifications/subscribe', async (req, res) => {
  const subscriberEmail = (req.body?.subscriberEmail || '').trim().toLowerCase();
  const targetUserEmail = (req.body?.targetUserEmail || '').trim().toLowerCase();
  const targetUserName = (req.body?.targetUserName || '').trim();

  if (!subscriberEmail || !targetUserEmail) {
    return res.status(400).json({ error: 'E-mails do assinante e do usuário alvo são obrigatórios.' });
  }

  if (subscriberEmail === targetUserEmail) {
    return res.status(400).json({ error: 'Você não pode ativar notificações para si mesmo.' });
  }

  try {
    const existing = await subscriptionsCollection.findOne({
      subscriberEmail,
      targetUserEmail
    });

    if (existing) {
      await subscriptionsCollection.deleteOne({ _id: existing._id });
      return res.json({
        subscribed: false,
        targetUserEmail,
        message: `Notificações desativadas para ${targetUserName || targetUserEmail}.`
      });
    } else {
      await subscriptionsCollection.insertOne({
        subscriberEmail,
        targetUserEmail,
        targetUserName,
        createdAt: new Date().toISOString()
      });
      return res.json({
        subscribed: true,
        targetUserEmail,
        message: `Notificações ativadas para ${targetUserName || targetUserEmail}!`
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listar para quais usuários o assinante ativou notificações
app.get('/api/notifications/subscriptions', async (req, res) => {
  const subscriberEmail = (req.query?.subscriberEmail || '').trim().toLowerCase();
  if (!subscriberEmail) {
    return res.status(400).json({ error: 'E-mail do assinante não fornecido.' });
  }

  try {
    const subs = await subscriptionsCollection.find({ subscriberEmail }).toArray();
    res.json(subs.map(s => ({
      targetUserEmail: s.targetUserEmail,
      targetUserName: s.targetUserName || s.targetUserEmail
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listar notificações recebidas pelo usuário logado
app.get('/api/notifications', async (req, res) => {
  const recipientEmail = (req.query?.recipientEmail || '').trim().toLowerCase();
  if (!recipientEmail) {
    return res.status(400).json({ error: 'E-mail do destinatário não fornecido.' });
  }

  try {
    const notifications = await notificationsCollection
      .find({ recipientEmail })
      .sort({ timestamp: -1 })
      .limit(40)
      .toArray();

    res.json(notifications.map(n => ({
      id: n._id,
      recipientEmail: n.recipientEmail,
      senderEmail: n.senderEmail,
      senderName: n.senderName,
      senderAvatar: n.senderAvatar,
      postId: n.postId,
      postText: n.postText,
      type: n.type,
      message: n.message,
      read: Boolean(n.read),
      timestamp: n.timestamp
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Marcar notificações como lidas
app.put('/api/notifications/read', async (req, res) => {
  const recipientEmail = (req.body?.recipientEmail || '').trim().toLowerCase();
  const notificationId = req.body?.notificationId;

  if (!recipientEmail) {
    return res.status(400).json({ error: 'E-mail do destinatário não fornecido.' });
  }

  try {
    if (notificationId && notificationId !== 'all') {
      const qId = ObjectId.isValid(notificationId) ? new ObjectId(notificationId) : notificationId;
      await notificationsCollection.updateOne(
        { $or: [{ _id: qId }, { _id: notificationId }], recipientEmail },
        { $set: { read: true } }
      );
    } else {
      await notificationsCollection.updateMany(
        { recipientEmail, read: false },
        { $set: { read: true } }
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Escuta em porta local apenas se não estiver no ambiente da Vercel (servidor autônomo)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Servidor de desenvolvimento rodando em http://localhost:${PORT}`);
  });
}

export default app;
