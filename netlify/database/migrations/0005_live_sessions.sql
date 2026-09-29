ALTER TABLE sop_check_items ADD COLUMN IF NOT EXISTS scope VARCHAR(32) NOT NULL DEFAULT 'step';
ALTER TABLE sop_check_items ADD COLUMN IF NOT EXISTS judge_type VARCHAR(32) NOT NULL DEFAULT 'action';
ALTER TABLE sop_check_items ADD COLUMN IF NOT EXISTS missing_evidence VARCHAR(32) NOT NULL DEFAULT 'not_observed';
ALTER TABLE sop_check_items ADD COLUMN IF NOT EXISTS evidence_from VARCHAR(32) NOT NULL DEFAULT 'any';
ALTER TABLE sop_check_items ADD COLUMN IF NOT EXISTS segment_source VARCHAR(32) NOT NULL DEFAULT 'worker';

CREATE TABLE IF NOT EXISTS cameras (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  name VARCHAR(128) NOT NULL,
  rtsp_url VARCHAR(1024),
  preview_url VARCHAR(1024),
  role VARCHAR(32) NOT NULL DEFAULT 'global',
  mount VARCHAR(32) NOT NULL DEFAULT 'fixed',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  sop_id INTEGER NOT NULL REFERENCES sops(id),
  camera_id INTEGER NOT NULL REFERENCES cameras(id),
  detail_camera_id INTEGER REFERENCES cameras(id),
  analysis_id INTEGER REFERENCES analyses(id),
  mode VARCHAR(32) NOT NULL DEFAULT 'sequential',
  status VARCHAR(32) NOT NULL DEFAULT 'live',
  wave_index INTEGER NOT NULL DEFAULT 1,
  group_key VARCHAR(190) NOT NULL,
  current_step_order INTEGER NOT NULL DEFAULT 0,
  suggested_step_order INTEGER,
  title VARCHAR(255) NOT NULL,
  worker_token VARCHAR(64) NOT NULL UNIQUE,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS session_events (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  kind VARCHAR(32) NOT NULL,
  step_order INTEGER,
  actor VARCHAR(32) NOT NULL DEFAULT 'supervisor',
  message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE analyses ADD COLUMN IF NOT EXISTS session_id INTEGER REFERENCES work_sessions(id);
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS wave_index INTEGER;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS camera_id INTEGER REFERENCES cameras(id);
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS work_mode VARCHAR(32);

ALTER TABLE analysis_frames ADD COLUMN IF NOT EXISTS camera_role VARCHAR(32) NOT NULL DEFAULT 'any';
