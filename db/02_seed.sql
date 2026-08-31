-- ============================================================================
-- 02_seed.sql — Flexlearn Virtual College Seed & Initial Setup
-- Run AFTER 01_schema.sql.
-- ============================================================================

-- Plan limits used by the dashboard and by the quota checks inside the
-- edge functions. Edit freely from Super Admin → Settings later.
INSERT INTO public.platform_settings (key, value)
VALUES (
  'plan_limits',
  '{
    "free":       {"max_products": 5,   "max_faqs": 10,  "max_orders_per_month": 50,   "contacts_per_month": 50,   "ai_messages_per_month": 100,   "max_images_per_product": 1,  "max_staff": 0},
    "pro":        {"max_products": 50,  "max_faqs": 100, "max_orders_per_month": 500,  "contacts_per_month": 300,  "ai_messages_per_month": 2000,  "max_images_per_product": 5,  "max_staff": 0},
    "enterprise": {"max_products": 999, "max_faqs": 999, "max_orders_per_month": 9999, "contacts_per_month": 1500, "ai_messages_per_month": 99999, "max_images_per_product": 10, "max_staff": 5}
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Flexlearn Virtual College Admin Account & Initial Catalog Seed
--
-- 1. Create the auth user in Supabase Studio (Authentication → Add user:
--    Email: info@flexlearn.lk or admin@flexlearn.lk, Auto Confirm User: ON).
-- 2. Copy its UUID and replace '<USER_UUID>' below.
-- ----------------------------------------------------------------------------

Profile & Role Setup:
INSERT INTO public.profiles (user_id, email, full_name, plan_tier, billing_cycle_start)
VALUES ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'admin@flexlearn.lk', 'Flexlearn Virtual College Admin', 'enterprise', now())
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'super_admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Business Settings Setup
-- ----------------------------------------------------------------------------
INSERT INTO public.settings (user_id, key, value) VALUES
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'welcome_message', '{
    "text": "Welcome to Flexlearn Virtual College! 🎓\nSri Lanka’s pioneering micro-audio learning platform for busy professionals and entrepreneurs.\n\nTo guide you with the most relevant training path, are you currently a Working Professional or a Business Owner / Entrepreneur? 🚀",
    "media_urls": []
  }'::jsonb),
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'payment_info', '{
    "bank_name": "Sampath Bank - Rajagiriya Branch",
    "account_name": "Flexlearn Virtual College Pvt Ltd",
    "account_number": "112214017815",
    "payhere_link": "https://payhere.lk/pay/o8ac7c787",
    "monthly_renewal_link": "https://payhere.lk/pay/oc94df555",
    "accounts": [
      {
        "account_type": "bank",
        "account_label": "Sampath Bank - Rajagiriya Branch",
        "account_name": "Flexlearn Virtual College Pvt Ltd",
        "account_number": "112214017815"
      },
      {
        "account_type": "digital",
        "account_label": "PayHere Online (Visa/Mastercard)",
        "account_name": "Flexlearn Online Checkout",
        "account_number": "https://payhere.lk/pay/o8ac7c787"
      }
    ]
  }'::jsonb),
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'auto_responses', '{"enabled": true}'::jsonb),
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'inactivity_followup', '{
    "enabled": true,
    "hours": 24,
    "text": "Hi there! 👋 Just checking in from Flexlearn Virtual College. Have you had a chance to listen to the 5 free sample audios?\n\n🎧 Free Preview Audios: https://drive.google.com/drive/folders/1_0NMZk4MV-4jTGuH8_-WiJe-U162J-5w\n\n🎥 Previous Student Feedback: https://drive.google.com/drive/folders/1SAkQbZO5t0Y5EyX7gfZQuSEamlFM6d-l\n\nOur 10% special discount (LKR 4,500 for full 90-day access to all 17 modules) is active now. Let me know if you have any questions! 😊"
  }'::jsonb),
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'renewal_followup', '{
    "enabled": true,
    "days": 85,
    "text": "Hello! 🎓 Your 90-Day Flexlearn Challenge access is ending soon. To maintain continuous access to all 367+ audio lessons and new monthly modules, join our Monthly Subscription plan here:\n👉 https://payhere.lk/pay/oc94df555\n\nOr reply here to renew with another 90-day access plan!"
  }'::jsonb)
ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value;

