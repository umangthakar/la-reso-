-- ============================================================
-- 13_home_slider.sql — Home landing-page image slider
--
-- Array of image URLs shown in the auto-rotating slider on /home, managed
-- from the admin Content & Settings → "Home Slider" section (uploads go to
-- the site-assets bucket). Seeded with three default images.
--
-- Safe to run more than once.
-- ============================================================

alter table public.site_settings
  add column if not exists home_slider jsonb not null default
    '["https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1600&q=80","https://images.unsplash.com/photo-1535141192574-5d4897c12636?auto=format&fit=crop&w=1600&q=80","https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=1600&q=80"]'::jsonb;
