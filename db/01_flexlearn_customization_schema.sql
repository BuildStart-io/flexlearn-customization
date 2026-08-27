-- ============================================================================
-- 01_flexlearn_customization_schema.sql
-- Dedicated schema: "flexlearn-customization"
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS "flexlearn-customization";

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Grant usage on schema
GRANT USAGE ON SCHEMA "flexlearn-customization" TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA "flexlearn-customization" GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA "flexlearn-customization" GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA "flexlearn-customization" GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'app_role' AND n.nspname = 'flexlearn-customization') THEN
        CREATE TYPE "flexlearn-customization".app_role AS ENUM ('super_admin', 'business_user');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'plan_tier' AND n.nspname = 'flexlearn-customization') THEN
        CREATE TYPE "flexlearn-customization".plan_tier AS ENUM ('free', 'pro', 'enterprise');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- HELPER & SECURITY FUNCTIONS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "flexlearn-customization".update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'flexlearn-customization', 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "flexlearn-customization".has_role(_user_id uuid, _role "flexlearn-customization".app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'flexlearn-customization', 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "flexlearn-customization".user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION "flexlearn-customization".is_admin()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'flexlearn-customization', 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "flexlearn-customization".profiles
    WHERE user_id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION "flexlearn-customization".is_staff_of(_staff_user_id uuid, _owner_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'flexlearn-customization', 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "flexlearn-customization".staff_accounts
    WHERE staff_user_id = _staff_user_id
      AND owner_id = _owner_id
      AND is_active = true
  )
$$;

CREATE OR REPLACE FUNCTION "flexlearn-customization".get_staff_owner_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'flexlearn-customization', 'public'
AS $$
  SELECT owner_id FROM "flexlearn-customization".staff_accounts
  WHERE staff_user_id = _user_id AND is_active = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION "flexlearn-customization".can_read_usage(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'flexlearn-customization', 'public'
AS $$
  SELECT auth.uid() IS NULL
      OR auth.uid() = _user_id
      OR "flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role)
      OR "flexlearn-customization".is_staff_of(auth.uid(), _user_id)
$$;

CREATE OR REPLACE FUNCTION "flexlearn-customization".get_ai_message_usage(_user_id uuid, _since timestamp with time zone)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'flexlearn-customization', 'public'
AS $$
DECLARE c integer;
BEGIN
  IF NOT "flexlearn-customization".can_read_usage(_user_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT COUNT(*) INTO c
  FROM "flexlearn-customization".ai_usage_logs
  WHERE user_id = _user_id AND created_at >= _since;
  RETURN COALESCE(c, 0);
END;
$$;

CREATE OR REPLACE FUNCTION "flexlearn-customization".get_contact_usage(_user_id uuid, _since timestamp with time zone)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'flexlearn-customization', 'public'
AS $$
DECLARE c integer;
BEGIN
  IF NOT "flexlearn-customization".can_read_usage(_user_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT COUNT(DISTINCT phone_number) INTO c
  FROM "flexlearn-customization".contact_usage
  WHERE user_id = _user_id AND created_at >= _since;
  RETURN COALESCE(c, 0);
END;
$$;

CREATE OR REPLACE FUNCTION "flexlearn-customization".enforce_order_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'flexlearn-customization', 'public'
AS $$
DECLARE
  current_count INT;
  max_allowed INT;
  tier TEXT;
  addon INT;
  plan_max INT;
  platform_limits JSONB;
  billing_start TIMESTAMPTZ;
  month_start TIMESTAMPTZ;
  next_date TIMESTAMPTZ;
  user_paused BOOLEAN;
BEGIN
  SELECT p.plan_tier, p.addon_orders, p.billing_cycle_start, p.is_paused
  INTO tier, addon, billing_start, user_paused
  FROM "flexlearn-customization".profiles p WHERE p.user_id = NEW.user_id;

  IF user_paused = true THEN
    RAISE EXCEPTION 'Account is paused. Cannot create orders.';
  END IF;

  IF tier IS NULL THEN
    tier := 'free';
    addon := 0;
  END IF;

  -- Calculate billing month start
  IF billing_start IS NOT NULL THEN
    month_start := billing_start;
    LOOP
      next_date := month_start + INTERVAL '1 month';
      EXIT WHEN next_date > NOW();
      month_start := next_date;
    END LOOP;
  ELSE
    month_start := date_trunc('month', NOW());
  END IF;

  SELECT ps.value INTO platform_limits
  FROM "flexlearn-customization".platform_settings ps WHERE ps.key = 'plan_limits';

  IF platform_limits IS NOT NULL AND platform_limits->tier IS NOT NULL THEN
    plan_max := COALESCE((platform_limits->tier->>'max_orders_per_month')::INT, 50);
  ELSE
    plan_max := CASE tier WHEN 'pro' THEN 500 WHEN 'enterprise' THEN 9999 ELSE 50 END;
  END IF;

  max_allowed := plan_max + COALESCE(addon, 0);

  SELECT COUNT(*) INTO current_count
  FROM "flexlearn-customization".orders WHERE user_id = NEW.user_id AND created_at >= month_start;

  IF current_count >= max_allowed THEN
    RAISE EXCEPTION 'Monthly order limit reached (% of %). Upgrade your plan to process more orders.', current_count, max_allowed;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "flexlearn-customization".handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'flexlearn-customization', 'public'
AS $$
BEGIN
  INSERT INTO "flexlearn-customization".profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "flexlearn-customization".handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'flexlearn-customization', 'public'
AS $$
BEGIN
  INSERT INTO "flexlearn-customization".user_roles (user_id, role)
  VALUES (NEW.id, 'business_user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "flexlearn-customization".handle_new_user_settings()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'flexlearn-customization', 'public'
AS $$
BEGIN
  INSERT INTO "flexlearn-customization".settings (user_id, key, value) VALUES
    (NEW.id, 'welcome_message', '{"text": "Welcome! How can I help you today?"}'::jsonb),
    (NEW.id, 'payment_info', '{"bank_name": "", "account_number": "", "account_name": ""}'::jsonb),
    (NEW.id, 'auto_responses', '{"enabled": true}'::jsonb)
  ON CONFLICT (user_id, key) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "flexlearn-customization".profiles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    plan_tier "flexlearn-customization".plan_tier DEFAULT 'free'::"flexlearn-customization".plan_tier NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    business_name text,
    max_products integer DEFAULT 5,
    max_faqs integer DEFAULT 10,
    billing_cycle_start timestamp with time zone DEFAULT now(),
    is_paused boolean DEFAULT false NOT NULL,
    addon_products integer DEFAULT 0 NOT NULL,
    addon_faqs integer DEFAULT 0 NOT NULL,
    addon_orders integer DEFAULT 0 NOT NULL,
    addon_ai_messages integer DEFAULT 0 NOT NULL,
    addon_images integer DEFAULT 0 NOT NULL,
    addon_staff integer DEFAULT 0 NOT NULL,
    addon_contacts integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "flexlearn-customization".user_roles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role "flexlearn-customization".app_role DEFAULT 'business_user'::"flexlearn-customization".app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS "flexlearn-customization".settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT settings_user_id_key_unique UNIQUE (user_id, key)
);

CREATE TABLE IF NOT EXISTS "flexlearn-customization".staff_accounts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    staff_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    staff_email text NOT NULL,
    staff_name text,
    permissions text[] DEFAULT '{}'::text[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    whatsapp_number text,
    CONSTRAINT staff_accounts_owner_id_staff_user_id_key UNIQUE (owner_id, staff_user_id)
);

CREATE TABLE IF NOT EXISTS "flexlearn-customization".platform_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    key text NOT NULL UNIQUE,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "flexlearn-customization".products (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    product_type text DEFAULT 'physical'::text NOT NULL CHECK (product_type IN ('physical', 'digital')),
    variations jsonb DEFAULT '[]'::jsonb,
    images text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    delivery_price numeric DEFAULT 0,
    video_url text
);

CREATE TABLE IF NOT EXISTS "flexlearn-customization".orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    customer_address text,
    order_items jsonb DEFAULT '[]'::jsonb NOT NULL,
    special_instructions text,
    payment_method text DEFAULT 'cod'::text NOT NULL CHECK (payment_method IN ('cod', 'bank_transfer')),
    status text DEFAULT 'pending'::text NOT NULL CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
    total_amount numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    whatsapp_phone text,
    district text
);

CREATE TABLE IF NOT EXISTS "flexlearn-customization".leads (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    phone_number text NOT NULL,
    customer_name text,
    customer_type text,
    lead_stage text,
    email text,
    notes text,
    assigned_to uuid,
    status text DEFAULT 'new'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leads_user_id_phone_number_key UNIQUE (user_id, phone_number)
);

CREATE TABLE IF NOT EXISTS "flexlearn-customization".conversations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    phone_number text NOT NULL,
    message text NOT NULL,
    direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    message_type text DEFAULT 'text'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "flexlearn-customization".faqs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question text NOT NULL,
    answer text NOT NULL,
    product_id uuid REFERENCES "flexlearn-customization".products(id) ON DELETE SET NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_tracked boolean DEFAULT false NOT NULL,
    media_urls text[] DEFAULT '{}'::text[] NOT NULL
);

CREATE TABLE IF NOT EXISTS "flexlearn-customization".faq_usage_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    faq_id uuid NOT NULL REFERENCES "flexlearn-customization".faqs(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    phone_number text NOT NULL,
    sender_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "flexlearn-customization".fcm_tokens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_token text NOT NULL,
    device_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fcm_tokens_user_id_device_token_key UNIQUE (user_id, device_token)
);

CREATE TABLE IF NOT EXISTS "flexlearn-customization".message_queue (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    wsender_message_id text NOT NULL UNIQUE,
    user_id uuid NOT NULL,
    phone_number text NOT NULL,
    sender_name text DEFAULT 'Unknown'::text,
    message_text text DEFAULT ''::text,
    message_type text DEFAULT 'text'::text,
    session_api_key text,
    raw_payload jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    correlation_id text
);

CREATE TABLE IF NOT EXISTS "flexlearn-customization".chat_takeovers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    phone_number text NOT NULL,
    is_taken_over boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_takeovers_user_id_phone_number_key UNIQUE (user_id, phone_number)
);

CREATE TABLE IF NOT EXISTS "flexlearn-customization".contact_usage (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    phone_number text NOT NULL,
    period_start timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "flexlearn-customization".ai_usage_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    phone_number text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "flexlearn-customization".user_wsender_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id text NOT NULL,
    session_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    session_api_key text,
    CONSTRAINT user_wsender_sessions_user_id_session_id_key UNIQUE (user_id, session_id)
);

CREATE TABLE IF NOT EXISTS "flexlearn-customization".scheduled_campaigns (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title text NOT NULL,
    message_template text NOT NULL,
    target_filter jsonb DEFAULT '{}'::jsonb NOT NULL,
    total_recipients integer DEFAULT 0 NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'scheduled' NOT NULL CHECK (status IN ('draft', 'scheduled', 'running', 'completed', 'cancelled', 'paused')),
    start_date date NOT NULL,
    end_date date NOT NULL,
    daily_start_time text NOT NULL DEFAULT '09:00',
    daily_end_time text NOT NULL DEFAULT '18:00',
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "flexlearn-customization".scheduled_messages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id uuid NOT NULL REFERENCES "flexlearn-customization".scheduled_campaigns(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_name text NOT NULL,
    phone_number text NOT NULL,
    message text NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    sent_at timestamp with time zone,
    status text DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ----------------------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS contact_usage_unique_per_cycle ON "flexlearn-customization".contact_usage (user_id, phone_number, period_start);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_created ON "flexlearn-customization".ai_usage_logs (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_contact_usage_user_created ON "flexlearn-customization".contact_usage (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON "flexlearn-customization".conversations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON "flexlearn-customization".conversations (phone_number);
CREATE INDEX IF NOT EXISTS idx_faq_usage_logs_faq_id ON "flexlearn-customization".faq_usage_logs (faq_id);
CREATE INDEX IF NOT EXISTS idx_faq_usage_logs_user_phone ON "flexlearn-customization".faq_usage_logs (user_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON "flexlearn-customization".leads (assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_user ON "flexlearn-customization".leads (user_id);
CREATE INDEX IF NOT EXISTS idx_message_queue_processed ON "flexlearn-customization".message_queue (processed_at) WHERE (status = 'done'::text);
CREATE INDEX IF NOT EXISTS idx_message_queue_status ON "flexlearn-customization".message_queue (status, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));
CREATE INDEX IF NOT EXISTS idx_message_queue_status_created ON "flexlearn-customization".message_queue (status, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));
CREATE INDEX IF NOT EXISTS idx_message_queue_user_processing ON "flexlearn-customization".message_queue (user_id) WHERE (status = 'processing'::text);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON "flexlearn-customization".orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON "flexlearn-customization".orders (status);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_queue ON "flexlearn-customization".scheduled_messages (status, scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_campaign ON "flexlearn-customization".scheduled_messages (campaign_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_user ON "flexlearn-customization".scheduled_messages (user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_campaigns_user ON "flexlearn-customization".scheduled_campaigns (user_id);

-- ----------------------------------------------------------------------------
-- TRIGGERS ON TABLES
-- ----------------------------------------------------------------------------

CREATE OR REPLACE TRIGGER check_order_limit
    BEFORE INSERT ON "flexlearn-customization".orders
    FOR EACH ROW EXECUTE FUNCTION "flexlearn-customization".enforce_order_limit();

CREATE OR REPLACE TRIGGER update_faqs_updated_at
    BEFORE UPDATE ON "flexlearn-customization".faqs
    FOR EACH ROW EXECUTE FUNCTION "flexlearn-customization".update_updated_at_column();

CREATE OR REPLACE TRIGGER update_fcm_tokens_updated_at
    BEFORE UPDATE ON "flexlearn-customization".fcm_tokens
    FOR EACH ROW EXECUTE FUNCTION "flexlearn-customization".update_updated_at_column();

CREATE OR REPLACE TRIGGER update_leads_updated_at
    BEFORE UPDATE ON "flexlearn-customization".leads
    FOR EACH ROW EXECUTE FUNCTION "flexlearn-customization".update_updated_at_column();

CREATE OR REPLACE TRIGGER update_message_queue_updated_at
    BEFORE UPDATE ON "flexlearn-customization".message_queue
    FOR EACH ROW EXECUTE FUNCTION "flexlearn-customization".update_updated_at_column();

CREATE OR REPLACE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON "flexlearn-customization".orders
    FOR EACH ROW EXECUTE FUNCTION "flexlearn-customization".update_updated_at_column();

CREATE OR REPLACE TRIGGER update_platform_settings_updated_at
    BEFORE UPDATE ON "flexlearn-customization".platform_settings
    FOR EACH ROW EXECUTE FUNCTION "flexlearn-customization".update_updated_at_column();

CREATE OR REPLACE TRIGGER update_products_updated_at
    BEFORE UPDATE ON "flexlearn-customization".products
    FOR EACH ROW EXECUTE FUNCTION "flexlearn-customization".update_updated_at_column();

CREATE OR REPLACE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON "flexlearn-customization".profiles
    FOR EACH ROW EXECUTE FUNCTION "flexlearn-customization".update_updated_at_column();

CREATE OR REPLACE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON "flexlearn-customization".settings
    FOR EACH ROW EXECUTE FUNCTION "flexlearn-customization".update_updated_at_column();

CREATE OR REPLACE TRIGGER update_staff_accounts_updated_at
    BEFORE UPDATE ON "flexlearn-customization".staff_accounts
    FOR EACH ROW EXECUTE FUNCTION "flexlearn-customization".update_updated_at_column();

CREATE OR REPLACE TRIGGER update_scheduled_campaigns_updated_at
    BEFORE UPDATE ON "flexlearn-customization".scheduled_campaigns
    FOR EACH ROW EXECUTE FUNCTION "flexlearn-customization".update_updated_at_column();

CREATE OR REPLACE TRIGGER update_scheduled_messages_updated_at
    BEFORE UPDATE ON "flexlearn-customization".scheduled_messages
    FOR EACH ROW EXECUTE FUNCTION "flexlearn-customization".update_updated_at_column();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) & POLICIES
-- ----------------------------------------------------------------------------

ALTER TABLE "flexlearn-customization".ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flexlearn-customization".chat_takeovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flexlearn-customization".contact_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flexlearn-customization".conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flexlearn-customization".faq_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flexlearn-customization".faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flexlearn-customization".fcm_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flexlearn-customization".leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flexlearn-customization".message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flexlearn-customization".orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flexlearn-customization".platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flexlearn-customization".products ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flexlearn-customization".profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flexlearn-customization".settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flexlearn-customization".staff_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flexlearn-customization".user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flexlearn-customization".user_wsender_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flexlearn-customization".scheduled_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flexlearn-customization".scheduled_messages ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can view their own profile" ON "flexlearn-customization".profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON "flexlearn-customization".profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Super admins can view all profiles" ON "flexlearn-customization".profiles FOR SELECT USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));
CREATE POLICY "Super admins can update all profiles" ON "flexlearn-customization".profiles FOR UPDATE USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));
CREATE POLICY "Staff can view owner profile" ON "flexlearn-customization".profiles FOR SELECT USING (EXISTS (SELECT 1 FROM "flexlearn-customization".staff_accounts sa WHERE sa.staff_user_id = auth.uid() AND sa.owner_id = profiles.user_id AND sa.is_active = true));
CREATE POLICY "Service can insert profiles" ON "flexlearn-customization".profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User Roles Policies
CREATE POLICY "Users can view own roles" ON "flexlearn-customization".user_roles FOR SELECT USING ((auth.uid() = user_id) OR "flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));
CREATE POLICY "Super admins can manage roles" ON "flexlearn-customization".user_roles FOR INSERT WITH CHECK ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));
CREATE POLICY "Super admins can update roles" ON "flexlearn-customization".user_roles FOR UPDATE USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));
CREATE POLICY "Super admins can delete roles" ON "flexlearn-customization".user_roles FOR DELETE USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));

-- Settings Policies
CREATE POLICY "Users can view own settings" ON "flexlearn-customization".settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own settings" ON "flexlearn-customization".settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON "flexlearn-customization".settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own settings" ON "flexlearn-customization".settings FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Super admins can view all settings" ON "flexlearn-customization".settings FOR SELECT USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));
CREATE POLICY "Super admins can update all settings" ON "flexlearn-customization".settings FOR UPDATE USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));
CREATE POLICY "Staff can view owner settings" ON "flexlearn-customization".settings FOR SELECT USING (EXISTS (SELECT 1 FROM "flexlearn-customization".staff_accounts sa WHERE sa.staff_user_id = auth.uid() AND sa.owner_id = settings.user_id AND sa.is_active = true));

-- Staff Accounts Policies
CREATE POLICY "Owners can view their staff" ON "flexlearn-customization".staff_accounts FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Owners can create staff" ON "flexlearn-customization".staff_accounts FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update their staff" ON "flexlearn-customization".staff_accounts FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owners can delete their staff" ON "flexlearn-customization".staff_accounts FOR DELETE USING (auth.uid() = owner_id);
CREATE POLICY "Staff can view own record" ON "flexlearn-customization".staff_accounts FOR SELECT USING (auth.uid() = staff_user_id);
CREATE POLICY "Super admins can view all staff" ON "flexlearn-customization".staff_accounts FOR SELECT USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));

-- Platform Settings Policies
CREATE POLICY "Authenticated users can view platform settings" ON "flexlearn-customization".platform_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Super admins can view platform settings" ON "flexlearn-customization".platform_settings FOR SELECT USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));
CREATE POLICY "Super admins can insert platform settings" ON "flexlearn-customization".platform_settings FOR INSERT WITH CHECK ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));
CREATE POLICY "Super admins can update platform settings" ON "flexlearn-customization".platform_settings FOR UPDATE USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));
CREATE POLICY "Super admins can delete platform settings" ON "flexlearn-customization".platform_settings FOR DELETE USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));

-- Products Policies
CREATE POLICY "Users can view own products" ON "flexlearn-customization".products FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own products" ON "flexlearn-customization".products FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own products" ON "flexlearn-customization".products FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own products" ON "flexlearn-customization".products FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Staff can view owner products" ON "flexlearn-customization".products FOR SELECT USING (EXISTS (SELECT 1 FROM "flexlearn-customization".staff_accounts sa WHERE sa.staff_user_id = auth.uid() AND sa.owner_id = products.user_id AND sa.is_active = true AND 'products'::text = ANY (sa.permissions)));
CREATE POLICY "Staff can create owner products" ON "flexlearn-customization".products FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM "flexlearn-customization".staff_accounts sa WHERE sa.staff_user_id = auth.uid() AND sa.owner_id = products.user_id AND sa.is_active = true AND 'products'::text = ANY (sa.permissions)));
CREATE POLICY "Staff can update owner products" ON "flexlearn-customization".products FOR UPDATE USING (EXISTS (SELECT 1 FROM "flexlearn-customization".staff_accounts sa WHERE sa.staff_user_id = auth.uid() AND sa.owner_id = products.user_id AND sa.is_active = true AND 'products'::text = ANY (sa.permissions)));

-- Orders Policies
CREATE POLICY "Users can view own orders" ON "flexlearn-customization".orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own orders" ON "flexlearn-customization".orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own orders" ON "flexlearn-customization".orders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own orders" ON "flexlearn-customization".orders FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Super admins can view all orders" ON "flexlearn-customization".orders FOR SELECT USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));
CREATE POLICY "Super admins can update all orders" ON "flexlearn-customization".orders FOR UPDATE USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));
CREATE POLICY "Staff can view owner orders" ON "flexlearn-customization".orders FOR SELECT USING (EXISTS (SELECT 1 FROM "flexlearn-customization".staff_accounts sa WHERE sa.staff_user_id = auth.uid() AND sa.owner_id = orders.user_id AND sa.is_active = true AND 'orders'::text = ANY (sa.permissions)));
CREATE POLICY "Staff can update owner orders" ON "flexlearn-customization".orders FOR UPDATE USING (EXISTS (SELECT 1 FROM "flexlearn-customization".staff_accounts sa WHERE sa.staff_user_id = auth.uid() AND sa.owner_id = orders.user_id AND sa.is_active = true AND 'orders'::text = ANY (sa.permissions)));

-- Leads Policies
CREATE POLICY "Owners manage their leads" ON "flexlearn-customization".leads TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Staff view owner leads" ON "flexlearn-customization".leads FOR SELECT TO authenticated USING ("flexlearn-customization".is_staff_of(auth.uid(), user_id));
CREATE POLICY "Staff insert owner leads" ON "flexlearn-customization".leads FOR INSERT TO authenticated WITH CHECK ("flexlearn-customization".is_staff_of(auth.uid(), user_id));
CREATE POLICY "Staff update owner leads" ON "flexlearn-customization".leads FOR UPDATE TO authenticated USING ("flexlearn-customization".is_staff_of(auth.uid(), user_id)) WITH CHECK ("flexlearn-customization".is_staff_of(auth.uid(), user_id));
CREATE POLICY "Super admins view all leads" ON "flexlearn-customization".leads FOR SELECT TO authenticated USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));

-- Conversations Policies
CREATE POLICY "Users can view own conversations" ON "flexlearn-customization".conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own conversations" ON "flexlearn-customization".conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own conversations" ON "flexlearn-customization".conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own conversations" ON "flexlearn-customization".conversations FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Super admins can view all conversations" ON "flexlearn-customization".conversations FOR SELECT USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));
CREATE POLICY "Staff can view owner conversations" ON "flexlearn-customization".conversations FOR SELECT USING (EXISTS (SELECT 1 FROM "flexlearn-customization".staff_accounts sa WHERE sa.staff_user_id = auth.uid() AND sa.owner_id = conversations.user_id AND sa.is_active = true AND 'conversations'::text = ANY (sa.permissions)));
CREATE POLICY "Staff can create owner conversations" ON "flexlearn-customization".conversations FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM "flexlearn-customization".staff_accounts sa WHERE sa.staff_user_id = auth.uid() AND sa.owner_id = conversations.user_id AND sa.is_active = true AND 'conversations'::text = ANY (sa.permissions)));

-- FAQs Policies
CREATE POLICY "Users can view own faqs" ON "flexlearn-customization".faqs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own faqs" ON "flexlearn-customization".faqs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own faqs" ON "flexlearn-customization".faqs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own faqs" ON "flexlearn-customization".faqs FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Super admins can view all faqs" ON "flexlearn-customization".faqs FOR SELECT USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));
CREATE POLICY "Super admins can update all faqs" ON "flexlearn-customization".faqs FOR UPDATE USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));
CREATE POLICY "Super admins can delete all faqs" ON "flexlearn-customization".faqs FOR DELETE USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));
CREATE POLICY "Staff can view owner faqs" ON "flexlearn-customization".faqs FOR SELECT USING (EXISTS (SELECT 1 FROM "flexlearn-customization".staff_accounts sa WHERE sa.staff_user_id = auth.uid() AND sa.owner_id = faqs.user_id AND sa.is_active = true AND 'faqs'::text = ANY (sa.permissions)));
CREATE POLICY "Staff can create owner faqs" ON "flexlearn-customization".faqs FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM "flexlearn-customization".staff_accounts sa WHERE sa.staff_user_id = auth.uid() AND sa.owner_id = faqs.user_id AND sa.is_active = true AND 'faqs'::text = ANY (sa.permissions)));
CREATE POLICY "Staff can update owner faqs" ON "flexlearn-customization".faqs FOR UPDATE USING (EXISTS (SELECT 1 FROM "flexlearn-customization".staff_accounts sa WHERE sa.staff_user_id = auth.uid() AND sa.owner_id = faqs.user_id AND sa.is_active = true AND 'faqs'::text = ANY (sa.permissions)));

-- FAQ Usage Logs Policies
CREATE POLICY "Users can view own faq usage logs" ON "flexlearn-customization".faq_usage_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Staff can view owner faq usage logs" ON "flexlearn-customization".faq_usage_logs FOR SELECT USING (EXISTS (SELECT 1 FROM "flexlearn-customization".staff_accounts sa WHERE sa.staff_user_id = auth.uid() AND sa.owner_id = faq_usage_logs.user_id AND sa.is_active = true AND 'faqs'::text = ANY (sa.permissions)));

-- FCM Tokens Policies
CREATE POLICY "Users can view own tokens" ON "flexlearn-customization".fcm_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tokens" ON "flexlearn-customization".fcm_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tokens" ON "flexlearn-customization".fcm_tokens FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tokens" ON "flexlearn-customization".fcm_tokens FOR DELETE USING (auth.uid() = user_id);

-- Chat Takeovers Policies
CREATE POLICY "Users can view their own takeovers" ON "flexlearn-customization".chat_takeovers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own takeovers" ON "flexlearn-customization".chat_takeovers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own takeovers" ON "flexlearn-customization".chat_takeovers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own takeovers" ON "flexlearn-customization".chat_takeovers FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Staff can view owner takeovers" ON "flexlearn-customization".chat_takeovers FOR SELECT USING (EXISTS (SELECT 1 FROM "flexlearn-customization".staff_accounts sa WHERE sa.staff_user_id = auth.uid() AND sa.owner_id = chat_takeovers.user_id AND sa.is_active = true AND 'conversations'::text = ANY (sa.permissions)));
CREATE POLICY "Staff can manage owner takeovers" ON "flexlearn-customization".chat_takeovers FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM "flexlearn-customization".staff_accounts sa WHERE sa.staff_user_id = auth.uid() AND sa.owner_id = chat_takeovers.user_id AND sa.is_active = true AND 'conversations'::text = ANY (sa.permissions)));
CREATE POLICY "Staff can update owner takeovers" ON "flexlearn-customization".chat_takeovers FOR UPDATE USING (EXISTS (SELECT 1 FROM "flexlearn-customization".staff_accounts sa WHERE sa.staff_user_id = auth.uid() AND sa.owner_id = chat_takeovers.user_id AND sa.is_active = true AND 'conversations'::text = ANY (sa.permissions)));

-- Usage Logs Policies
CREATE POLICY "Users can view own contact usage" ON "flexlearn-customization".contact_usage FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR "flexlearn-customization".is_staff_of(auth.uid(), user_id));
CREATE POLICY "Super admins can view all contact usage" ON "flexlearn-customization".contact_usage FOR SELECT TO authenticated USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));
CREATE POLICY "Users can view own ai usage logs" ON "flexlearn-customization".ai_usage_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Super admins can view all ai usage logs" ON "flexlearn-customization".ai_usage_logs FOR SELECT USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));

-- Sessions Policies
CREATE POLICY "Users can view own sessions" ON "flexlearn-customization".user_wsender_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own sessions" ON "flexlearn-customization".user_wsender_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON "flexlearn-customization".user_wsender_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions" ON "flexlearn-customization".user_wsender_sessions FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Super admins can view all sessions" ON "flexlearn-customization".user_wsender_sessions FOR SELECT USING ("flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role));

-- Scheduled Broadcasts Policies
CREATE POLICY "Users can manage their own campaigns" ON "flexlearn-customization".scheduled_campaigns
    FOR ALL USING (auth.uid() = user_id OR "flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role) OR "flexlearn-customization".is_staff_of(auth.uid(), user_id))
    WITH CHECK (auth.uid() = user_id OR "flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role) OR "flexlearn-customization".is_staff_of(auth.uid(), user_id));

CREATE POLICY "Users can manage their own scheduled messages" ON "flexlearn-customization".scheduled_messages
    FOR ALL USING (auth.uid() = user_id OR "flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role) OR "flexlearn-customization".is_staff_of(auth.uid(), user_id))
    WITH CHECK (auth.uid() = user_id OR "flexlearn-customization".has_role(auth.uid(), 'super_admin'::"flexlearn-customization".app_role) OR "flexlearn-customization".is_staff_of(auth.uid(), user_id));

-- ----------------------------------------------------------------------------
-- DEDICATED AUTH TRIGGERS ON auth.users (Isolation for Flexlearn)
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS on_auth_user_created_flexlearn ON auth.users;
CREATE TRIGGER on_auth_user_created_flexlearn
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION "flexlearn-customization".handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_role_flexlearn ON auth.users;
CREATE TRIGGER on_auth_user_created_role_flexlearn
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION "flexlearn-customization".handle_new_user_role();

DROP TRIGGER IF EXISTS on_auth_user_created_settings_flexlearn ON auth.users;
CREATE TRIGGER on_auth_user_created_settings_flexlearn
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION "flexlearn-customization".handle_new_user_settings();
