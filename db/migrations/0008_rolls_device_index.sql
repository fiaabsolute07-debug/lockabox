-- The anti-bot pacing check reads a device's latest roll on every guest roll; without this it scans all rolls.
create index if not exists rolls_device on rolls (device_id, created_at desc) where device_id is not null;
