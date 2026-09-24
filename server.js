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

