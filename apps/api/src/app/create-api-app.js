import express from 'express';
import cors from 'cors';

export const createApiApp = ({ jsonLimit = '20mb' } = {}) => {
  const app = express();
  const configuredOrigins = String(process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  app.disable('x-powered-by');
  app.use(cors({
    origin(origin, callback) {
      if (!origin || configuredOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('origin not allowed'));
    },
  }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.use(express.json({ limit: jsonLimit }));
  return app;
};

export const registerBaseRoutes = ({ app, meta, getHealth }) => {
  app.get('/health', async (_req, res) => {
    try {
      res.json(await getHealth());
    } catch (error) {
      res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
  });

  app.get('/api/meta', (_req, res) => res.json(meta));
};
