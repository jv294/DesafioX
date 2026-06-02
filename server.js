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

async function startServer() {
  try {
    console.log('Tentando conectar ao MongoDB Atlas...');
    await client.connect();
    const db = client.db(MONGODB_DBNAME);
    usersCollection = db.collection('users');
    postsCollection = db.collection('posts');
    await usersCollection.createIndex({ email: 1 }, { unique: true });

    console.log('==================================================');
    console.log(' Conectado com sucesso ao MongoDB Atlas! ');
    console.log('==================================================');

    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
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

// Register User
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Por favor, preencha todos os campos.' });
  }

  try {
    // Gerar hash seguro da senha antes de persistir
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

    // Comparar o hash da senha de forma segura
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    res.json({ id: user._id, name: user.name, email: user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all users (for tagging and displaying in frontend)
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
  const { author, text, media, mediaType, taggedUsers, timestamp } = req.body;
  if (!author) {
    return res.status(400).json({ error: 'Autor do post não fornecido.' });
  }

  try {
    const newPost = {
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

