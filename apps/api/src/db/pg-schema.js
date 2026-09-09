export const ensurePgSchema = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      academic_year TEXT DEFAULT '',
      name TEXT NOT NULL,
      class_name TEXT,
      student_no TEXT,
      memo TEXT DEFAULT '',
      risk_level TEXT DEFAULT 'normal',
      tags TEXT DEFAULT '',
      student_track TEXT DEFAULT 'course',
      transferred_at TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS counseling_notes (
      id SERIAL PRIMARY KEY,
      academic_year TEXT DEFAULT '',
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      note_date TIMESTAMP NOT NULL DEFAULT NOW(),
      category TEXT DEFAULT 'general',
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      due_at TIMESTAMP,
      importance TEXT DEFAULT 'normal',
      done BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE students ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT '';
    ALTER TABLE students ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'normal';
    ALTER TABLE students ADD COLUMN IF NOT EXISTS tags TEXT DEFAULT '';
    ALTER TABLE students ADD COLUMN IF NOT EXISTS student_track TEXT DEFAULT 'course';
    ALTER TABLE students ADD COLUMN IF NOT EXISTS transferred_at TEXT DEFAULT '';
    ALTER TABLE students ADD COLUMN IF NOT EXISTS basic_survey TEXT DEFAULT '';
    ALTER TABLE counseling_notes ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT '';
    ALTER TABLE counseling_notes ALTER COLUMN note_date TYPE TIMESTAMP USING note_date::timestamp;
  `);
};
