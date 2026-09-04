CREATE TABLE IF NOT EXISTS sops (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  original_filename VARCHAR(512) NOT NULL,
  content_type VARCHAR(128) NOT NULL,
  blob_key VARCHAR(600) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'uploaded',
  summary TEXT,
  model_used VARCHAR(128),
  parse_error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sop_check_items (
  id SERIAL PRIMARY KEY,
  sop_id INTEGER NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  key_actions JSONB DEFAULT '[]'::jsonb,
  pass_criteria TEXT,
  risk_hint TEXT,
  category VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS analyses (
  id SERIAL PRIMARY KEY,
  sop_id INTEGER NOT NULL REFERENCES sops(id),
  title VARCHAR(255) NOT NULL,
  video_filename VARCHAR(512) NOT NULL,
  video_blob_key VARCHAR(600),
  video_duration_sec REAL,
  frame_interval_sec REAL NOT NULL,
  max_frames INTEGER NOT NULL,
  model_used VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'uploading',
  overall_result VARCHAR(32),
  overall_summary TEXT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analysis_frames (
  id SERIAL PRIMARY KEY,
  analysis_id INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  frame_index INTEGER NOT NULL,
  timestamp_sec REAL NOT NULL,
  blob_key VARCHAR(600) NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_item_results (
  id SERIAL PRIMARY KEY,
  analysis_id INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  check_item_id INTEGER NOT NULL REFERENCES sop_check_items(id),
  verdict VARCHAR(32) NOT NULL,
  confidence REAL,
  reasoning TEXT,
  evidence_frame_ids JSONB DEFAULT '[]'::jsonb,
  observed_at_sec REAL
);

CREATE TABLE IF NOT EXISTS app_settings (
  id SERIAL PRIMARY KEY,
  default_model VARCHAR(128) NOT NULL DEFAULT 'gemini-2.5-flash',
  frame_interval_sec REAL NOT NULL DEFAULT 2,
  max_frames INTEGER NOT NULL DEFAULT 30,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO app_settings (id, default_model, frame_interval_sec, max_frames)
SELECT 1, 'gemini-2.5-flash', 2, 30
WHERE NOT EXISTS (SELECT 1 FROM app_settings);

CREATE INDEX IF NOT EXISTS idx_sop_check_items_sop_id ON sop_check_items(sop_id);
CREATE INDEX IF NOT EXISTS idx_analyses_sop_id ON analyses(sop_id);
CREATE INDEX IF NOT EXISTS idx_analysis_frames_analysis_id ON analysis_frames(analysis_id);
CREATE INDEX IF NOT EXISTS idx_analysis_item_results_analysis_id ON analysis_item_results(analysis_id);
