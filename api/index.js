import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DBNAME = process.env.MONGODB_DBNAME || 'app';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const client = new MongoClient(MONGODB_URI || '');
let usersCollection;
let postsCollection;

// Armazenar conexão ativa em cache no ciclo de vida da Serverless Function
let isConnected = false;

async function ensureDbConnected() {
  if (!isConnected) {
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI não está definida nas variáveis de ambiente.');
    }
    console.log('Tentando conectar ao MongoDB Atlas...');
    await client.connect();
    const db = client.db(MONGODB_DBNAME);
    usersCollection = db.collection('users');
    postsCollection = db.collection('posts');
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    isConnected = true;
    console.log('Conectado ao MongoDB Atlas com sucesso!');
  }
}

// Middleware para garantir conexão com banco de dados antes de processar qualquer rota
app.use(async (req, res, next) => {
  try {
    await ensureDbConnected();
    next();
  } catch (err) {
    console.error('Erro de conexão com o banco de dados:', err);
    res.status(500).json({ error: 'Erro ao conectar ao banco de dados: ' + err.message });
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
    res.status(201).json({ id: result.insertedId, name, email });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado.' });
    }
    res.status(500).json({ error: err.message });
  }
});

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

    res.json({ id: user._id, name: user.name, email: user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const users = await usersCollection.find({}, { projection: { _id: 1, name: 1, email: 1 } }).toArray();
    res.json(users.map(user => ({ id: user._id, name: user.name, email: user.email })));
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
    res.status(201).json({ id: result.insertedId, ...newPost });
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
