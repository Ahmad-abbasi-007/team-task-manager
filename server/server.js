import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';

import { pool, testDatabaseConnection } from './db.js';
import authRoutes from './routes/auth.js';
import teamsRoutes from './routes/teams.js';
import tasksRoutes from './routes/tasks.js';

dotenv.config();

const app = express();

// Render proxy ke liye zaroori
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// CORS Origin set karna
const clientOrigin = isProduction
  ? (process.env.CLIENT_URL || 'https://team-task-manager-eyh0.onrender.com')
  : (process.env.CLIENT_URL || 'http://localhost:5173');

if (
  !process.env.SESSION_SECRET ||
  process.env.SESSION_SECRET === 'replace_this_with_a_long_random_secret'
) {
  throw new Error('Set a secure SESSION_SECRET in server/.env');
}

app.use(helmet());

app.use(cors({
  origin: clientOrigin,
  credentials: true, // Cookies allow karne ke liye
}));

app.use(express.json({ limit: '10kb' }));

const PgSession = connectPgSimple(session);

app.use(session({
  name: 'connect.sid',
  store: new PgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction, 
    sameSite: isProduction ? 'none' : 'lax', 
    maxAge: 1000 * 60 * 60 * 24,
    domain: isProduction ? '.onrender.com' : undefined, // Domain fix for cross-device
    partitioned: isProduction, // Mobile/New devices fix
  },
}));

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Team Task Manager API is running',
  });
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'healthy' });
});

app.get('/api/db-health', async (req, res) => {
  try {
    const result = await testDatabaseConnection();

    res.json({
      success: true,
      message: 'Database connection successful',
      databaseTime: result.database_time,
    });
  } catch (error) {
    console.error('Database health check failed:', error.code, error.message);

    res.status(500).json({
      success: false,
      message: 'Database connection failed',
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/tasks', tasksRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

app.use((error, req, res, next) => {
  console.error('Server error:', error.code || error.message);

  if (res.headersSent) return next(error);

  res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);