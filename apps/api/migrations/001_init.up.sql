-- Rede Sentinela — initial schema
-- Port of the Drizzle ORM schema from apps/web/src/db/schema.ts

CREATE TABLE IF NOT EXISTS ipma_warnings (
    id          SERIAL PRIMARY KEY,
    area        TEXT NOT NULL,
    type        TEXT NOT NULL,
    level       TEXT NOT NULL,
    level_color TEXT,
    text        TEXT,
    start_time  TIMESTAMPTZ,
    end_time    TIMESTAMPTZ,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ipma_forecasts (
    id            SERIAL PRIMARY KEY,
    forecast_date DATE NOT NULL,
    temp_min      REAL,
    temp_max      REAL,
    precip_prob   REAL,
    wind_dir      TEXT,
    wind_class    INTEGER,
    weather_type  INTEGER,
    fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prociv_occurrences (
    id                SERIAL PRIMARY KEY,
    external_id       TEXT UNIQUE,
    nature            TEXT,
    state             TEXT,
    municipality      TEXT,
    lat               REAL,
    lng               REAL,
    start_time        TIMESTAMPTZ,
    num_means         INTEGER,
    num_operatives    INTEGER,
    num_aerial_means  INTEGER,
    fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eredes_outages (
    id                   SERIAL PRIMARY KEY,
    municipality         TEXT NOT NULL,
    outage_count         INTEGER NOT NULL,
    extraction_datetime  TEXT,
    fetched_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eredes_scheduled_work (
    id            SERIAL PRIMARY KEY,
    postal_code   TEXT,
    locality      TEXT,
    district      TEXT,
    municipality  TEXT,
    start_time    TEXT,
    end_time      TEXT,
    reason        TEXT,
    fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recovery_snapshots (
    id                 SERIAL PRIMARY KEY,
    date               DATE NOT NULL,
    electricity_score  REAL,
    weather_score      REAL,
    occurrences_score  REAL,
    overall_score      REAL,
    metadata           JSONB,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS recovery_snapshots_date_idx ON recovery_snapshots (date);

CREATE TABLE IF NOT EXISTS prociv_warnings (
    id          SERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    summary     TEXT NOT NULL,
    detail_url  TEXT,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS antennas (
    id           SERIAL PRIMARY KEY,
    lat          REAL NOT NULL,
    lng          REAL NOT NULL,
    operators    TEXT[] NOT NULL,
    owner        TEXT,
    type         TEXT NOT NULL,
    technologies TEXT[] NOT NULL,
    fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bt_poles (
    id         SERIAL PRIMARY KEY,
    lat        REAL NOT NULL,
    lng        REAL NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telecom_cache (
    id         SERIAL PRIMARY KEY,
    data       JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS substation_cache (
    id         SERIAL PRIMARY KEY,
    data       JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transformer_cache (
    id         SERIAL PRIMARY KEY,
    data       JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         SERIAL PRIMARY KEY,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    lat        REAL,
    lng        REAL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_reports (
    id              SERIAL PRIMARY KEY,
    -- ReportType: electricity|telecom_mobile|telecom_fixed|water|water_leak|roads|roads_tree|roads_damage|other_garbage|other
    type            TEXT NOT NULL,
    operator        TEXT,
    description     TEXT,
    street          TEXT,
    parish          TEXT,
    lat             REAL NOT NULL,
    lng             REAL NOT NULL,
    -- priority: urgente|importante|normal
    priority        TEXT NOT NULL DEFAULT 'normal',
    resolved        BOOLEAN NOT NULL DEFAULT FALSE,
    upvotes         INTEGER NOT NULL DEFAULT 1,
    last_upvoted_at TIMESTAMPTZ,
    image_url       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
