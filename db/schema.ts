import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial().primaryKey(),
  username: varchar({ length: 64 }).notNull().unique(),
  displayName: varchar("display_name", { length: 128 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar({ length: 32 }).notNull().default("user"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
  token: varchar({ length: 128 }).primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
});

export const sops = pgTable("sops", {
  id: serial().primaryKey(),
  userId: integer("user_id").references(() => users.id),
  title: varchar({ length: 255 }).notNull(),
  originalFilename: varchar("original_filename", { length: 512 }).notNull(),
  contentType: varchar("content_type", { length: 128 }).notNull(),
  blobKey: varchar("blob_key", { length: 600 }).notNull(),
  status: varchar({ length: 32 }).notNull().default("uploaded"),
  summary: text(),
  modelUsed: varchar("model_used", { length: 128 }),
  parseError: text("parse_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sopCheckItems = pgTable("sop_check_items", {
  id: serial().primaryKey(),
  sopId: integer("sop_id")
    .notNull()
    .references(() => sops.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull(),
  title: varchar({ length: 255 }).notNull(),
  description: text(),
  keyActions: jsonb("key_actions").$type<string[]>().default([]),
  passCriteria: text("pass_criteria"),
  riskHint: text("risk_hint"),
  category: varchar({ length: 64 }),
});

export const analyses = pgTable("analyses", {
  id: serial().primaryKey(),
  userId: integer("user_id").references(() => users.id),
  sopId: integer("sop_id")
    .notNull()
    .references(() => sops.id),
  title: varchar({ length: 255 }).notNull(),
  sourceType: varchar("source_type", { length: 32 }).notNull().default("video"),
  videoFilename: varchar("video_filename", { length: 512 }).notNull(),
  videoBlobKey: varchar("video_blob_key", { length: 600 }),
  videoDurationSec: real("video_duration_sec"),
  frameIntervalSec: real("frame_interval_sec").notNull(),
  maxFrames: integer("max_frames").notNull(),
  modelUsed: varchar("model_used", { length: 128 }).notNull(),
  status: varchar({ length: 32 }).notNull().default("uploading"),
  overallResult: varchar("overall_result", { length: 32 }),
  overallSummary: text("overall_summary"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const analysisFrames = pgTable("analysis_frames", {
  id: serial().primaryKey(),
  analysisId: integer("analysis_id")
    .notNull()
    .references(() => analyses.id, { onDelete: "cascade" }),
  frameIndex: integer("frame_index").notNull(),
  timestampSec: real("timestamp_sec").notNull(),
  blobKey: varchar("blob_key", { length: 600 }).notNull(),
});

export const analysisItemResults = pgTable("analysis_item_results", {
  id: serial().primaryKey(),
  analysisId: integer("analysis_id")
    .notNull()
    .references(() => analyses.id, { onDelete: "cascade" }),
  checkItemId: integer("check_item_id")
    .notNull()
    .references(() => sopCheckItems.id),
  verdict: varchar({ length: 32 }).notNull(),
  confidence: real(),
  reasoning: text(),
  evidenceFrameIds: jsonb("evidence_frame_ids").$type<number[]>().default([]),
  observedAtSec: real("observed_at_sec"),
});

export const appSettings = pgTable("app_settings", {
  id: serial().primaryKey(),
  defaultModel: varchar("default_model", { length: 128 })
    .notNull()
    .default("gpt-5.6-terra"),
  provider: varchar({ length: 32 }).notNull().default("custom"),
  modelName: varchar("model_name", { length: 128 }).notNull().default("gpt-5.6-terra"),
  apiKey: text("api_key"),
  baseUrl: varchar("base_url", { length: 512 }),
  frameIntervalSec: real("frame_interval_sec").notNull().default(5),
  maxFrames: integer("max_frames").notNull().default(30),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Sop = typeof sops.$inferSelect;
export type NewSop = typeof sops.$inferInsert;
export type SopCheckItem = typeof sopCheckItems.$inferSelect;
export type Analysis = typeof analyses.$inferSelect;
export type AnalysisFrame = typeof analysisFrames.$inferSelect;
export type AnalysisItemResult = typeof analysisItemResults.$inferSelect;
export type AppSettings = typeof appSettings.$inferSelect;
