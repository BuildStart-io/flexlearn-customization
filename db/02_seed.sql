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

-- ----------------------------------------------------------------------------
-- Product Catalog Seed (90-Day SME Growth, Sales & Leadership Challenge)
-- ----------------------------------------------------------------------------
INSERT INTO public.products (
  user_id,
  name,
  description,
  price,
  product_type,
  is_active
) VALUES (
  'a3f5436e-3ce3-4959-ae7a-922b1ee05cbe',
  '90-Day SME Growth, Sales & Leadership Challenge',
  'Complete 90-Day access to 17 modules and 367 micro-audio lessons (3-5 mins in Sinhala) on www.flexlearn.lk. Covers Career Growth, Communication, Conflict Resolution, Decision-Making, Entrepreneurship, HRM, Leading Teams, Remote Teams, Managing Up, Gen Z Leadership, Performance, Self-Leadership, Talent Acquisition, Time Management, Sales Mastery, Tele-Sales, and The Indispensable Secretary. Promo Price: LKR 4,500 (Regular: LKR 5,000).',
  4500,
  'digital',
  true
);

-- ----------------------------------------------------------------------------
-- Pre-Approved FAQs Seed (14 Complete FAQs)
-- ----------------------------------------------------------------------------
INSERT INTO public.faqs (user_id, question, answer, is_active, is_tracked) VALUES
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'How do I access the course?', 'After payment confirmation, you receive login credentials to our mobile-friendly dashboard at www.flexlearn.lk. No heavy app downloads required — access instantly via any web browser on your phone, tablet, or laptop.', true, true),
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'Is this a live class?', 'No, these are pre-recorded high-quality audio lessons (3-5 minutes each) in Sinhala that you can listen to anytime, anywhere (during commute, gym, breaks, or driving).', true, true),
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'Can I get a certificate?', 'Flexlearn is a skills-based, practical professional development course focused on real workplace results and career growth rather than academic certificates.', true, true),
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'What if I do not have enough time?', 'The course is specifically designed for people with NO time! Each audio lesson is only 3–5 minutes. If you spend just 15 minutes in traffic, you have enough time to finish a lesson.', true, true),
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'Can I pay via Bank Transfer?', 'Yes! You can pay via direct transfer to our official Sampath Bank account: Bank: Sampath Bank - Rajagiriya Branch | A/C Name: Flexlearn Virtual College Pvt Ltd | A/C No: 112214017815. Please send the payment slip, your Full Name, and Email once paid.', true, true),
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'Can I pay online using Visa or Mastercard?', 'Yes, you can pay online securely via PayHere using Visa or Mastercard at: https://payhere.lk/pay/o8ac7c787', true, true),
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'After 3 months (90 days), what is the next step?', 'After 90 days, you can continue your ongoing professional development by subscribing to our Monthly Subscription plan via https://payhere.lk/pay/oc94df555 or renewing your 90-day access plan.', true, true),
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'Can I download these audio lessons?', 'No, audio lessons cannot be downloaded, but you have 24/7 unlimited streaming access to the entire audio library on www.flexlearn.lk during your 3-month access period.', true, true),
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'Can I buy just a single course or module?', 'Single courses cannot be bought separately. Professional development requires developing well-rounded skills across leadership, sales, communication, and management rather than just one isolated skill.', true, true),
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'Where can I listen to free sample audios?', 'You can listen to the Free Preview (first 5 episodes) on Google Drive here: https://drive.google.com/drive/folders/1_0NMZk4MV-4jTGuH8_-WiJe-U162J-5w', true, true),
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'Where can I see previous student feedbacks and reviews?', 'You can watch video feedbacks from our previous students on Google Drive here: https://drive.google.com/drive/folders/1SAkQbZO5t0Y5EyX7gfZQuSEamlFM6d-l', true, true),
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'Who is the trainer?', 'The program is designed and delivered by Niroshan Gunatilaka — former military officer, MBA holder, and decade-long corporate trainer in Sri Lanka. LinkedIn: https://www.linkedin.com/in/niroshan-gunatilaka/ | Facebook: https://www.facebook.com/niroshan.gunatilake/', true, true),
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'Do you offer Corporate or Enterprise training plans?', 'Yes! We provide specialized corporate training packages. Please share your Name, Company Name, Contact Number, and Email, and our team will get in touch with you.', true, true),
  ('a3f5436e-3ce3-4959-ae7a-922b1ee05cbe', 'Where is Flexlearn Virtual College located?', 'Flexlearn Virtual College (Pvt) Ltd is located at 1st Floor, Jana Jaya City, Rajagiriya, Sri Lanka. Our platform is open 24/7 online.', true, true);
