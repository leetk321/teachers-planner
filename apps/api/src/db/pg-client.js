import pkg from 'pg';

const { Pool } = pkg;

export const createPgPool = () => new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'teacher_notebook',
  user: process.env.DB_USER || 'teacher',
  password: process.env.DB_PASSWORD || 'teacherpass',
});
