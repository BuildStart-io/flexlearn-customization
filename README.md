# Flexlearn Customizations (`flexlearn-customization`)

This repository contains the custom features and system enhancements built for **Flexlearn Virtual College (Pvt) Ltd**:

---

### 1. 🤖 AI Student Counsellor & Sales Engine
- **Specialized Persona**: Configured as an empathetic AI Student Counsellor representing Flexlearn Virtual College and founder Niroshan Gunatilaka.
- **Sinhala & English Auto-Detection**: Auto-detects and replies in fluent native Sinhala (Unicode or Singlish) and English.
- **Customer Persona Classification**: Identifies whether an inbound lead is a **Working Professional** or a **Business Owner / SME Entrepreneur** and delivers tailored pitches.
- **"90-Day SME Growth, Sales & Leadership Challenge" Pitch**:
  - Full bundle of 17 modules and 367 bite-sized audios (3–5 mins each in Sinhala) on `www.flexlearn.lk`.
  - Promotes the promotional price of **LKR 4,500** (Regular: LKR 5,000).
  - Clarifies that individual courses are not sold separately for comprehensive skill development.
- **Free Sample & Testimonial Delivery**: Automatically shares the 5 free preview audios Drive link and previous student video feedback folder.
- **Payment & Onboarding Integration**:
  - Delivers the online PayHere checkout link (`https://payhere.lk/pay/o8ac7c787`) and Sampath Bank details (A/C: 112214017815, Rajagiriya Branch).
  - Collects payment slip proof, name, email, and phone number for account setup on `www.flexlearn.lk`.
- **90-Day Renewal Guidance**: Explains the Monthly Subscription renewal link (`https://payhere.lk/pay/oc94df555`) or 90-day repeat after 3 months.
- **Corporate Training Lead Capture**: Captures company name, contact person, phone, and email for enterprise training inquiries and flags for admin follow-up.
- **Dynamic Context Loading**: AI dynamically loads payment accounts, active products, and FAQs directly from the database in real time.

---

### 2. 👥 Customers Management Dashboard (`/dashboard/customers`)
- **Paying Student Registry**: Automatically aggregates paying students from orders with metrics for total spend (LKR), total orders, enrolled programs, and districts.
- **Search & Filtering**: Real-time search across student names, phone numbers, districts, and payment statuses (*Paid/Active*, *Delivered*, *Processing*, *Pending*).
- **Student Profile Drawer**: Inspect complete order history, payment methods, delivery status, and notes.
- **Manual Customer Registration**: An **"Add Customer"** modal allows admins to manually register students and log offline bank payments.
- **CSV Export**: One-click export of customer records.

---

### 3. ⏱️ Anti-Spam Broadcast Scheduler (`/dashboard/schedule`)
- **Anti-Spam Time Slot & Jitter Engine**:
  - Partitions the chosen daily window across the campaign duration by the number of recipient students.
  - Applies a randomized non-linear jitter timestamp to each message, protecting the WhatsApp number from bulk broadcast bans.
- **Personalized Message Templates**: Supports dynamic variables (`{name}`, `{product}`, `{district}`) with live WhatsApp message bubble preview.
- **Audience Targeting**: Broadcast to all paying customers or filter by specific programs/districts.
- **Live Timeline Simulation**: Previews exact simulated dispatch timestamps before confirming.
- **Background Dispatcher (`supabase/functions/send-scheduled`)**: PostgreSQL cron (`pg_cron`) automatically processes pending messages every minute and syncs logs to live chat threads.

---

### 4. 💬 Direct Customer Enrollment from Live Chats (`/dashboard/conversations`)
- Quick **"Add Customer"** action in the chat header that auto-fills the lead's name and WhatsApp number into the enrollment modal.

---

### 5. 🎯 Leads Pipeline with Persona Badges (`/dashboard/leads`)
- Visual badges for customer classification (**`💼 Professional`**, **`🏢 Business Owner`**, **`🏛️ Corporate`**) and lead stages.
- Filter leads by persona type, follow-up status, or assigned staff member.

---

### 6. 🔁 Automated Follow-Up & Renewal Sequences (`supabase/functions/send-followups`)
- **Unconverted Leads Follow-Up**: Automatically follows up with leads who paused before buying, offering the 5 free sample audios and promo discount.
- **Active Students 3-Month Renewal Follow-Up**: Triggers around Day 85 of access to guide students to the PayHere Monthly Subscription plan or 90-day renewal.
