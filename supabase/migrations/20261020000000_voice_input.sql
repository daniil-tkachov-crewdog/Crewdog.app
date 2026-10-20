-- Voice input: the composer's microphone button.
--
-- Recording is transcribed server-side and sent as an ordinary text prompt, so
-- the flag only decides whether the button is offered — nothing downstream of
-- the composer knows a message was spoken rather than typed.
--
-- Two columns, one per chat path, matching how every other API setting is
-- stored: Normal and Pro are configured independently in the admin panel and a
-- shared row that moves both at once is the bug that split them in the first
-- place.
alter table public.app_settings
  -- On by default in both modes: speaking is the point of the feature, and an
  -- admin who wants it off can say so.
  add column if not exists voice_input     boolean not null default true,
  add column if not exists pro_voice_input boolean not null default true;

-- get_public_app_settings() is deliberately left alone, as with the previous
-- feature flags: logged-out visitors cannot chat at all, so they never reach
-- the composer, and the frontend default (on) covers them either way.
