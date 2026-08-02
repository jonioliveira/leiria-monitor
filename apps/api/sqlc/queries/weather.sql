-- name: ListCurrentWarnings :many
SELECT id, area, type, level, level_color, text, start_time, end_time, fetched_at
FROM ipma_warnings
WHERE fetched_at >= NOW() - INTERVAL '12 hours'
ORDER BY
    CASE level WHEN 'red' THEN 0 WHEN 'orange' THEN 1 WHEN 'yellow' THEN 2 ELSE 3 END,
    start_time;

-- name: ListForecast :many
SELECT id, forecast_date, temp_min, temp_max, precip_prob, wind_dir, wind_class, weather_type, fetched_at
FROM ipma_forecasts
WHERE forecast_date >= CURRENT_DATE
ORDER BY forecast_date
LIMIT 7;
