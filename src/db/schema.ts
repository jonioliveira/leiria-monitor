import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  date,
  real,
  jsonb,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";

export const ipmaWarnings = pgTable("ipma_warnings", {
  id: serial("id").primaryKey(),
  area: text("area").notNull(),
  type: text("type").notNull(),
  level: text("level").notNull(),
  levelColor: text("level_color"),
  text: text("text"),
  startTime: timestamp("start_time", { withTimezone: true }),
  endTime: timestamp("end_time", { withTimezone: true }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ipmaForecasts = pgTable("ipma_forecasts", {
  id: serial("id").primaryKey(),
  forecastDate: date("forecast_date").notNull(),
  tempMin: real("temp_min"),
  tempMax: real("temp_max"),
  precipProb: real("precip_prob"),
  windDir: text("wind_dir"),
  windClass: integer("wind_class"),
  weatherType: integer("weather_type"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
});

export const procivOccurrences = pgTable("prociv_occurrences", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").unique(),
  nature: text("nature"),
  state: text("state"),
  municipality: text("municipality"),
  lat: real("lat"),
  lng: real("lng"),
  startTime: timestamp("start_time", { withTimezone: true }),
  numMeans: integer("num_means"),
  numOperatives: integer("num_operatives"),
  numAerialMeans: integer("num_aerial_means"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
});

export const eredesOutages = pgTable("eredes_outages", {
  id: serial("id").primaryKey(),
  municipality: text("municipality").notNull(),
  outageCount: integer("outage_count").notNull(),
  extractionDatetime: text("extraction_datetime"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
});

export const eredesScheduledWork = pgTable("eredes_scheduled_work", {
  id: serial("id").primaryKey(),
  postalCode: text("postal_code"),
  locality: text("locality"),
  district: text("district"),
  municipality: text("municipality"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  reason: text("reason"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
});

export const recoverySnapshots = pgTable(
  "recovery_snapshots",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    electricityScore: real("electricity_score"),
    weatherScore: real("weather_score"),
    occurrencesScore: real("occurrences_score"),
    overallScore: real("overall_score"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("recovery_snapshots_date_idx").on(table.date)]
);

export const procivWarnings = pgTable("prociv_warnings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  detailUrl: text("detail_url"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
});

export const antennas = pgTable("antennas", {
  id: serial("id").primaryKey(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  operators: text("operators").array().notNull(),
  owner: text("owner"),
  type: text("type").notNull(), // "mast" | "tower" | "other"
  technologies: text("technologies").array().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userReports = pgTable("user_reports", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // "electricity" | "telecom_mobile" | "telecom_fixed" | "water"
  operator: text("operator"), // null for electricity/water, "MEO"/"NOS"/"Vodafone"/"DIGI" for telecom types
  description: text("description"),
  street: text("street"),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  resolved: boolean("resolved").default(false).notNull(),
  upvotes: integer("upvotes").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
