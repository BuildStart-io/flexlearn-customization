# Flexlearn Customizations (`flexlearn-customization`)

This repository contains the custom features and system enhancements built on top of the BuildStart self-hosted platform for **Flexlearn Virtual College (Pvt) Ltd**.

---

## 🚀 Added Customizations & Features

### 1. Customers Management Tab (`/dashboard/customers`)
A dedicated dashboard for managing verified paying students and clients:
- **Automatic Aggregation**: Aggregates unique paying students from the `orders` table, tracking lifetime spend (LKR), total orders, enrolled programs (*"90-Day SME Growth, Sales & Leadership Challenge"*), and district.
- **Search & Filtering**: Real-time search across student names, WhatsApp phone numbers, districts, and products, with status filters (*Paid/Active*, *Delivered*, *Processing*, *Pending*).
- **Student Profile Drawer**: Inspect complete order histories, payment methods, delivery status, and LMS notes for any student.
- **Manual Customer Registration**: An **"Add Customer"** modal allows admins and staff to manually enroll students and record offline bank payments directly into the system.
- **Export Data**: One-click export of customer records to CSV.

---

### 2. Schedule Tab with Anti-Spam Jitter Engine (`/dashboard/schedule`)
An intelligent WhatsApp broadcast scheduler designed to prevent spam detection:
- **Anti-Spam Time Slot & Jitter Algorithm**:
  - Divides the chosen daily time window (e.g. `09:00` to `17:00`) across the selected date range by the number of recipient students.
  - Shuffles the recipient queue and applies a **randomized non-linear jitter timestamp** within each time slot.
  - Disperses message deliveries naturally throughout the day (e.g., *"1 message every ~8.5 minutes with random jitter"*), protecting the WhatsApp number from bulk broadcast bans.
- **Personalized Message Templates**: Supports dynamic variable interpolation (`{name}`, `{product}`, `{district}`) with live WhatsApp message bubble preview.
- **Audience Selection**: Target all paying customers or filter by specific programs/districts.
- **Live Timeline Simulation**: Previews the exact simulated dispatch timestamps before confirming the schedule.
- **Campaign Controls**: Real-time progress bars (`X / Y sent`), pause, resume, and per-message delivery logs.

---

### 3. Direct Customer Enrollment from Live Chats (`/dashboard/conversations`)
- Added an **"Add Customer"** action directly in the conversation header.
- Instantly converts chatting leads into registered paying students by auto-populating their name and WhatsApp number into the enrollment dialog.

---

### 4. Background Automated Broadcast Dispatcher
- **Edge Function (`supabase/functions/send-scheduled`)**: Checks and claims pending scheduled messages whose scheduled timestamp has arrived, dispatches them through the WAHA WhatsApp API, and tracks delivery status.
- **Chat History Synchronization**: Automatically inserts outbound broadcast logs into the `conversations` table so scheduled messages appear seamlessly inside each customer's live chat thread.
- **Automated Scheduling (`pg_cron`)**: Runs every minute via PostgreSQL cron triggers to process pending broadcasts in real time.

---

### 5. Dynamic Database-Driven AI Prompt & Payment Engine
- **100% Dynamic Context**: The AI Student Counsellor prompt in `supabase/functions/ai-chat` dynamically reads active products, FAQs, delivery settings, and payment accounts from the database `settings` table.
- **Zero-Code Payment Updates**: Any bank accounts (Sampath Bank, Commercial Bank), online links (PayHere), or digital wallets added under **Settings → Payment** are automatically formatted and offered by the bot in real time.

---

## 📁 Key File Structure of Customizations

```
├── db/
│   ├── 03_cron.sql                   # pg_cron job configuration including send-scheduled
│   └── 04_scheduled_broadcasts.sql   # Schema for scheduled_campaigns & scheduled_messages
├── frontend/src/
│   ├── pages/
│   │   ├── Customers.tsx             # Customers dashboard & order history view
│   │   ├── Schedule.tsx              # Broadcast campaign manager & anti-spam visualizer
│   │   └── Conversations.tsx         # Chat view with direct "Add Customer" integration
│   └── components/
│       └── customers/
│           └── AddCustomerDialog.tsx # Reusable customer enrollment & order creation modal
└── supabase/functions/
    ├── ai-chat/                      # Dynamic student counsellor & payment loader
    └── send-scheduled/               # Automated WhatsApp broadcast dispatcher worker
```
