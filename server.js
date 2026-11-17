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

if (!MONGODB_URI) {
  console.error('Por favor, defina a variável de ambiente MONGODB_URI no .env');
  process.exit(1);
}

app.use(cors());
// Configurar limite de tamanho de corpo maior para suportar uploads de mídias em Base64
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const client = new MongoClient(MONGODB_URI);
let usersCollection;
let postsCollection;
let subscriptionsCollection;
let notificationsCollection;
let friendsCollection;

async function startServer() {
  try {
    console.log('Tentando conectar ao MongoDB Atlas...');
    await client.connect();
    const db = client.db(MONGODB_DBNAME);
    usersCollection = db.collection('users');
    postsCollection = db.collection('posts');
    subscriptionsCollection = db.collection('subscriptions');
    notificationsCollection = db.collection('notifications');
    friendsCollection = db.collection('friends');
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    try {
      await friendsCollection.createIndex({ requesterEmail: 1, addresseeEmail: 1 }, { unique: true });
    } catch {
      // índice já existe
    }

    console.log('==================================================');
    console.log(' Conectado com sucesso ao MongoDB Atlas! ');
    console.log('==================================================');

    app.listen(3001, () => {
      console.log(`Servidor rodando em http://localhost:${3001}`);
    });
  } catch (err) {
    console.error('\n❌ ERRO CRÍTICO: Não foi possível conectar ao MongoDB Atlas.');
    console.error('--------------------------------------------------');
    console.error(`Detalhes técnicos do erro: ${err.message}`);
    console.error('--------------------------------------------------');
    console.error('Por favor, verifique os seguintes pontos no MongoDB Atlas:');
    console.error('1. Verifique se o seu IP atual está liberado em "Network Access" (adicione "0.0.0.0/0" para testar de qualquer rede).');
    console.error('2. Certifique-se de que o usuário e a senha no arquivo .env estão corretos.');
    console.error('3. Confirme se a URL do cluster no .env está digitada corretamente.');
    console.error('--------------------------------------------------\n');
    process.exit(1);
  }
}

startServer();

function calculateAge(birthDate) {
  const [year, month, day] = birthDate.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - year;

  const birthdayNotReached = 
  today.getMonth() + 1 < month ||
  (today.getMonth() + 1 === month && today.getDate() < day);

  if (birthdayNotReached) {
    age--;
  }
  return age;
}

// Register User
app.post('/api/register', async (req, res) => {
  const { name, email, password, birthDate } = req.body;
  if (!name || !email || !password || !birthDate) {
    return res.status(400).json({ error: 'Por favor, preencha todos os campos.' });
  }

  const age = calculateAge(birthDate);
  if (age < 18) {
    return res.status(400).json({ error: 'Você deve ter pelo menos 18 anos para se registrar.' });
  }

  if (age > 120){
    return res.status(400).json({ error: 'Idade inválida. Por favor, insira uma data de nascimento válida.' });
  }

  try {
    // Gerar hash seguro da senha antes de persistir
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await usersCollection.insertOne({ name, email, password: hashedPassword, birthDate });
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

    // Comparar o hash da senha de forma segura
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    res.json(toPublicUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all users (for tagging and displaying in frontend)
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

async function listFriendEmailsFor(email) {
  const normalized = (email || '').trim().toLowerCase();
  const set = new Set();
  if (!normalized || !friendsCollection) return set;
  const docs = await friendsCollection.find({ status: 'accepted' }).toArray();
  for (const doc of docs) {
    const req = (doc.requesterEmail || '').toLowerCase();
    const add = (doc.addresseeEmail || '').toLowerCase();
    if (req === normalized && add) set.add(add);
    if (add === normalized && req) set.add(req);
  }
  return set;
}

function viewerCanSeePost(post, viewerEmail, friendEmails) {
  const viewer = (viewerEmail || '').toLowerCase();
  const author = (post.author?.email || '').toLowerCase();
  const audience = post.audience || 'public';
  const tagged = (post.taggedUsers || []).some((u) => (u.email || '').toLowerCase() === viewer);

  if (!viewer) return audience === 'public';
  if (author === viewer) return true;
  if (audience === 'public') return true;
  if (audience === 'friends') return friendEmails.has(author) || tagged;
  if (audience === 'direct') return tagged;
  return false;
}

function mapPost(post) {
  return {
    id: post._id,
    parentId: post.parentId || null,
    author: post.author,
    text: post.text,
    media: post.media,
    mediaType: post.mediaType,
    taggedUsers: post.taggedUsers,
    timestamp: post.timestamp,
    audience: post.audience || 'public'
  };
}

// Get posts visible to the logged-in user
app.get('/api/posts', async (req, res) => {
  try {
    const viewerEmail = (req.query?.viewerEmail || '').trim().toLowerCase();
    const posts = await postsCollection.find({}).sort({ timestamp: -1 }).toArray();
    const mapped = posts.map(mapPost);
    const friendEmails = await listFriendEmailsFor(viewerEmail);
    const allowed = new Set();

    for (const post of mapped) {
      if (post.parentId) continue;
      if (viewerCanSeePost(post, viewerEmail, friendEmails)) {
        allowed.add(String(post.id));
      }
    }
    for (const post of mapped) {
      if (post.parentId && allowed.has(String(post.parentId))) {
        allowed.add(String(post.id));
      }
    }

    res.json(mapped.filter((post) => allowed.has(String(post.id))));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a post
app.post('/api/posts', async (req, res) => {
  const { author, text, media, mediaType, taggedUsers, timestamp, parentId, audience } = req.body;
  if (!author) {
    return res.status(400).json({ error: 'Autor do post não fornecido.' });
  }

  try {
    const tagged = taggedUsers || [];
    let postAudience = audience;
    if (!['public', 'friends', 'direct'].includes(postAudience)) {
      postAudience = tagged.length > 0 ? 'direct' : 'friends';
    }
    if (postAudience === 'direct' && tagged.length === 0) {
      postAudience = 'friends';
    }

    const newPost = {
      parentId: parentId || null,
      author,
      text: text || '',
      media: media || null,
      mediaType: mediaType || '',
      taggedUsers: tagged,
      timestamp: timestamp || new Date().toISOString(),
      audience: postAudience
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

function publicFriendUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    avatar: user.avatar || null
  };
}

async function findUserByFriendId(friendId) {
  const value = String(friendId || '').trim();
  if (!value) return null;
  if (ObjectId.isValid(value) && value.length === 24) {
    const byId = await usersCollection.findOne({ _id: new ObjectId(value) });
    if (byId) return byId;
  }
  return usersCollection.findOne({ email: value.toLowerCase() });
}

async function usersByEmails(emails) {
  const list = [...new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))];
  if (list.length === 0) return {};
  const found = await usersCollection.find(
    { email: { $in: list } },
    { projection: { _id: 1, name: 1, email: 1, avatar: 1 } }
  ).toArray();
  const map = {};
  for (const user of found) {
    map[user.email.toLowerCase()] = publicFriendUser(user);
  }
  return map;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findUserByEmail(email) {
  const value = String(email || '').trim();
  if (!value) return null;
  return usersCollection.findOne({
    email: { $regex: `^${escapeRegex(value)}$`, $options: 'i' }
  });
}

async function findFriendship(emailA, emailB) {
  const a = String(emailA || '').toLowerCase();
  const b = String(emailB || '').toLowerCase();
  const docs = await friendsCollection.find({
    $or: [
      { requesterEmail: a, addresseeEmail: b },
      { requesterEmail: b, addresseeEmail: a }
    ]
  }).toArray();
  if (docs.length > 0) return docs[0];

  const all = await friendsCollection.find({}).toArray();
  return all.find((doc) => {
    const req = (doc.requesterEmail || '').toLowerCase();
    const add = (doc.addresseeEmail || '').toLowerCase();
    return (req === a && add === b) || (req === b && add === a);
  }) || null;
}

// Listar amigos e solicitações
app.get('/api/friends', async (req, res) => {
  const email = (req.query?.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'E-mail do usuário não informado.' });
  }

  try {
    const me = await findUserByEmail(email);
    const myId = me ? String(me._id) : '';
    const myEmails = new Set([email, (me?.email || '').toLowerCase()].filter(Boolean));

    const docs = await friendsCollection.find({
      $or: [
        { requesterEmail: email },
        { addresseeEmail: email },
        { requesterEmail: me?.email },
        { addresseeEmail: me?.email },
        ...(myId ? [{ requesterId: myId }, { addresseeId: myId }] : [])
      ]
    }).sort({ createdAt: -1 }).toArray();

    const visibleDocs = docs.filter((doc) => {
      const req = (doc.requesterEmail || '').toLowerCase();
      const add = (doc.addresseeEmail || '').toLowerCase();
      return myEmails.has(req) || myEmails.has(add) || doc.requesterId === myId || doc.addresseeId === myId;
    });

    const otherEmails = visibleDocs.map((doc) => {
      const req = (doc.requesterEmail || '').toLowerCase();
      return myEmails.has(req) || doc.requesterId === myId ? doc.addresseeEmail : doc.requesterEmail;
    });
    const map = await usersByEmails(otherEmails);

    const isMeRequester = (doc) => {
      const req = (doc.requesterEmail || '').toLowerCase();
      return myEmails.has(req) || (myId && doc.requesterId === myId);
    };

    const toItem = (doc) => {
      const otherEmail = isMeRequester(doc) ? doc.addresseeEmail : doc.requesterEmail;
      const otherKey = (otherEmail || '').toLowerCase();
      return {
        id: String(doc._id),
        status: doc.status,
        incoming: doc.status === 'pending' && !isMeRequester(doc),
        user: map[otherKey] || map[otherEmail] || { id: doc.addresseeId || doc.requesterId || '', name: otherEmail, email: otherEmail, avatar: null },
        createdAt: doc.createdAt
      };
    };

    res.json({
      friends: visibleDocs.filter((d) => d.status === 'accepted').map(toItem),
      incoming: visibleDocs.filter((d) => d.status === 'pending' && !isMeRequester(d)).map(toItem),
      outgoing: visibleDocs.filter((d) => d.status === 'pending' && isMeRequester(d)).map(toItem)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enviar solicitação por ID (ou e-mail)
app.post('/api/friends/request', async (req, res) => {
  const fromEmail = (req.body?.fromEmail || '').trim().toLowerCase();
  const friendId = (req.body?.friendId || req.body?.toId || '').trim();

  if (!fromEmail || !friendId) {
    return res.status(400).json({ error: 'Informe seu e-mail e o ID do amigo.' });
  }

  try {
    const fromUser = await findUserByEmail(fromEmail);
    if (!fromUser) {
      return res.status(404).json({ error: 'Usuário logado não encontrado.' });
    }

    const toUser = await findUserByFriendId(friendId);
    if (!toUser) {
      return res.status(404).json({ error: 'Nenhum usuário encontrado com esse ID.' });
    }

    const toEmail = (toUser.email || '').toLowerCase();
    if (toEmail === fromEmail) {
      return res.status(400).json({ error: 'Você não pode adicionar a si mesmo.' });
    }

    const existing = await findFriendship(fromEmail, toEmail);
    if (existing?.status === 'accepted') {
      return res.status(400).json({ error: 'Vocês já são amigos.' });
    }
    if (existing?.status === 'pending' && existing.requesterEmail === fromEmail) {
      return res.status(400).json({ error: 'Solicitação já enviada. Aguarde a resposta.' });
    }
    if (existing?.status === 'pending' && existing.addresseeEmail === fromEmail) {
      await friendsCollection.updateOne(
        { _id: existing._id },
        { $set: { status: 'accepted', respondedAt: new Date().toISOString() } }
      );
      return res.json({
        message: `${toUser.name} já tinha te enviado um convite. Vocês agora são amigos.`,
        autoAccepted: true
      });
    }

    await friendsCollection.insertOne({
      requesterEmail: fromEmail,
      addresseeEmail: toEmail,
      requesterId: String(fromUser._id),
      addresseeId: String(toUser._id),
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    if (notificationsCollection) {
      await notificationsCollection.insertOne({
        recipientEmail: toEmail,
        senderEmail: fromEmail,
        senderName: fromUser.name || 'Alguém',
        senderAvatar: fromUser.avatar || null,
        postId: null,
        postText: '',
        type: 'friend_request',
        message: `${fromUser.name || 'Alguém'} enviou uma solicitação de amizade.`,
        read: false,
        timestamp: new Date().toISOString()
      });
    }

    res.status(201).json({ message: `Solicitação enviada para ${toUser.name}.` });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Solicitação já enviada.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Aceitar ou recusar solicitação
app.put('/api/friends/respond', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const requestId = req.body?.requestId;
  const action = (req.body?.action || '').trim().toLowerCase();

  if (!email || !requestId || !['accept', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Informe o pedido e se deseja aceitar ou recusar.' });
  }

  try {
    const qId = ObjectId.isValid(requestId) ? new ObjectId(requestId) : requestId;
    const me = await findUserByEmail(email);
    const myId = me ? String(me._id) : '';
    const doc = await friendsCollection.findOne({ _id: qId, status: 'pending' });
    const addressee = (doc?.addresseeEmail || '').toLowerCase();
    const isAddressee = doc && (addressee === email || (myId && doc.addresseeId === myId) || (me?.email && addressee === me.email.toLowerCase()));
    if (!isAddressee) {
      return res.status(404).json({ error: 'Solicitação não encontrada.' });
    }

    if (action === 'reject') {
      await friendsCollection.deleteOne({ _id: doc._id });
      return res.json({ message: 'Solicitação recusada.' });
    }

    await friendsCollection.updateOne(
      { _id: doc._id },
      { $set: { status: 'accepted', respondedAt: new Date().toISOString() } }
    );
    res.json({ message: 'Solicitação aceita. Vocês agora são amigos.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remover amizade ou cancelar pedido enviado
app.delete('/api/friends/:id', async (req, res) => {
  const email = (req.query?.email || req.body?.email || '').trim().toLowerCase();
  const { id } = req.params;
  if (!email || !id) {
    return res.status(400).json({ error: 'Informe o usuário e o ID da amizade.' });
  }

  try {
    const qId = ObjectId.isValid(id) ? new ObjectId(id) : id;
    const doc = await friendsCollection.findOne({
      _id: qId,
      $or: [{ requesterEmail: email }, { addresseeEmail: email }]
    });
    if (!doc) {
      return res.status(404).json({ error: 'Amizade não encontrada.' });
    }

    await friendsCollection.deleteOne({ _id: doc._id });
    res.json({ message: doc.status === 'accepted' ? 'Amigo removido.' : 'Pedido cancelado.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
