CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  line_user_id VARCHAR(80) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  picture_url TEXT NULL,
  phone VARCHAR(32) NULL,
  email VARCHAR(180) NULL,
  avatar VARCHAR(16) NOT NULL DEFAULT '💪',
  avatar_tier ENUM('มือใหม่','ฝึกหน้าบ้าน','พอตัว','แข่งขัน') NOT NULL DEFAULT 'มือใหม่',
  member_code VARCHAR(32) NOT NULL,
  status ENUM('active','suspended','deleted') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_line_user_id (line_user_id),
  UNIQUE KEY uq_users_member_code (member_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS memberships (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  plan_name VARCHAR(120) NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  status ENUM('active','expired','cancelled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_memberships_user_status (user_id, status),
  CONSTRAINT fk_memberships_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS payment_id BIGINT UNSIGNED NULL AFTER user_id;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS metadata JSON NULL AFTER status;
ALTER TABLE memberships ADD INDEX IF NOT EXISTS idx_memberships_ends (status, ends_at);

-- Paid package pauses: access is blocked between starts_at and ends_at, and the
-- membership end date is extended by the same number of days when the pause is applied.
CREATE TABLE IF NOT EXISTS membership_pauses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  membership_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  payment_id BIGINT UNSIGNED NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  days INT NOT NULL,
  status ENUM('active','cancelled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_membership_pauses_membership (membership_id, status),
  KEY idx_membership_pauses_user (user_id, ends_at),
  CONSTRAINT fk_membership_pauses_membership FOREIGN KEY (membership_id) REFERENCES memberships(id),
  CONSTRAINT fk_membership_pauses_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_entitlements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  payment_id BIGINT UNSIGNED NULL,
  entitlement_type VARCHAR(64) NOT NULL,
  title VARCHAR(180) NOT NULL,
  remaining_uses INT NULL,
  starts_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at DATETIME NULL,
  status ENUM('active','used','expired','cancelled') NOT NULL DEFAULT 'active',
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_entitlements_user_status (user_id, status),
  KEY idx_entitlements_type_status (entitlement_type, status),
  CONSTRAINT fk_entitlements_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qr_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  purpose ENUM('member','booking','coupon','entitlement','payment') NOT NULL,
  ref_id VARCHAR(80) NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_qr_token_hash (token_hash),
  KEY idx_qr_user_purpose (user_id, purpose, expires_at),
  CONSTRAINT fk_qr_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Visits: one row each time staff consume a member QR (admin QR verify). Shown as the member's
-- visit history. The title is copied from the right that was used, at scan time.
CREATE TABLE IF NOT EXISTS member_visits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  purpose VARCHAR(20) NOT NULL,
  ref_id VARCHAR(80) NULL,
  title VARCHAR(180) NULL,
  staff_id BIGINT UNSIGNED NULL,
  qr_token_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_member_visits_user (user_id, created_at),
  CONSTRAINT fk_member_visits_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name_th VARCHAR(120) NOT NULL,
  name_en VARCHAR(120) NOT NULL,
  description TEXT NULL,
  level INT NOT NULL DEFAULT 10,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(96) NOT NULL,
  name_th VARCHAR(160) NOT NULL,
  name_en VARCHAR(160) NOT NULL,
  group_key VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_permissions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_admin_role_permissions_role FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_admin_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES admin_permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_staff (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  password_hash VARCHAR(220) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  email VARCHAR(180) NULL,
  phone VARCHAR(32) NULL,
  status ENUM('active','suspended','deleted') NOT NULL DEFAULT 'active',
  role_id BIGINT UNSIGNED NOT NULL,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_staff_username (username),
  KEY idx_admin_staff_role_status (role_id, status),
  CONSTRAINT fk_admin_staff_role FOREIGN KEY (role_id) REFERENCES admin_roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  staff_id BIGINT UNSIGNED NULL,
  action VARCHAR(120) NOT NULL,
  target_type VARCHAR(80) NOT NULL,
  target_id VARCHAR(80) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_audit_staff_created (staff_id, created_at),
  KEY idx_admin_audit_target (target_type, target_id),
  CONSTRAINT fk_admin_audit_staff FOREIGN KEY (staff_id) REFERENCES admin_staff(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(64) NOT NULL,
  name_th VARCHAR(120) NOT NULL,
  icon VARCHAR(16) NOT NULL,
  description VARCHAR(255) NULL,
  requires_booking BOOLEAN NOT NULL DEFAULT TRUE,
  base_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sports_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS courts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sport_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  zone VARCHAR(80) NULL,
  capacity INT NOT NULL DEFAULT 4,
  surface VARCHAR(80) NULL,
  hourly_rate DECIMAL(10,2) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  notes TEXT NULL,
  status ENUM('available','maintenance','hidden') NOT NULL DEFAULT 'available',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_courts_sport (sport_id),
  UNIQUE KEY uq_courts_sport_name (sport_id, name),
  CONSTRAINT fk_courts_sport FOREIGN KEY (sport_id) REFERENCES sports(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE courts ADD UNIQUE KEY IF NOT EXISTS uq_courts_sport_name (sport_id, name);
ALTER TABLE courts ADD COLUMN IF NOT EXISTS surface VARCHAR(80) NULL AFTER capacity;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2) NULL AFTER surface;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0 AFTER hourly_rate;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS notes TEXT NULL AFTER sort_order;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;
ALTER TABLE courts ADD INDEX IF NOT EXISTS idx_courts_sport_status_sort (sport_id, status, sort_order, id);

CREATE TABLE IF NOT EXISTS bookings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_no VARCHAR(32) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  sport_id BIGINT UNSIGNED NOT NULL,
  court_id BIGINT UNSIGNED NULL,
  title VARCHAR(180) NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  players INT NOT NULL DEFAULT 1,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('hold','pending_payment','paid','checked_in','cancelled','expired') NOT NULL DEFAULT 'pending_payment',
  qr_secret VARCHAR(96) NOT NULL,
  expires_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  cancel_reason VARCHAR(255) NULL,
  checked_in_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bookings_no (booking_no),
  UNIQUE KEY uq_booking_court_slot (court_id, starts_at, ends_at, status),
  KEY idx_bookings_user_status (user_id, status),
  KEY idx_bookings_slot (sport_id, starts_at, ends_at),
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_bookings_sport FOREIGN KEY (sport_id) REFERENCES sports(id),
  CONSTRAINT fk_bookings_court FOREIGN KEY (court_id) REFERENCES courts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL AFTER expires_at;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(255) NULL AFTER cancelled_at;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at DATETIME NULL AFTER cancel_reason;
ALTER TABLE bookings ADD INDEX IF NOT EXISTS idx_bookings_expiry (status, expires_at);
-- Counter bookings (staff): walk-in guests keep their name and phone here (the booking belongs to the
-- walk-in system user); weekly series share series_key (the client request id); created_by = staff.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_name VARCHAR(160) NULL AFTER user_id;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_phone VARCHAR(32) NULL AFTER guest_name;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS series_key VARCHAR(64) NULL AFTER checked_in_at;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS created_by BIGINT UNSIGNED NULL AFTER series_key;
ALTER TABLE bookings ADD INDEX IF NOT EXISTS idx_bookings_series (series_key);

-- Court time blocks (maintenance, events, private hire): the slot is not bookable while active.
CREATE TABLE IF NOT EXISTS court_blocks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  court_id BIGINT UNSIGNED NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  reason VARCHAR(160) NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_court_blocks_slot (court_id, starts_at, ends_at),
  CONSTRAINT fk_court_blocks_court FOREIGN KEY (court_id) REFERENCES courts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_no VARCHAR(32) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NULL,
  method ENUM('wallet','promptpay','card','line_pay','cash') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('created','paid','failed','cancelled','refunded') NOT NULL DEFAULT 'created',
  provider_ref VARCHAR(120) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_no (payment_no),
  KEY idx_payments_user_status (user_id, status),
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id) REFERENCES bookings(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PromptPay transfer slip uploaded by the member (file kept outside public/, see lib/slips.ts).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS slip_path VARCHAR(255) NULL AFTER metadata;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS slip_uploaded_at DATETIME NULL AFTER slip_path;
-- Client checkout id: a retried/double-submitted checkout replays instead of charging twice.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS request_id VARCHAR(64) NULL AFTER provider_ref;

-- PDPA consent: when the member accepted the published privacy policy (site_setting privacy-policy) and which version.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pdpa_accepted_at DATETIME NULL AFTER status;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pdpa_version VARCHAR(20) NULL AFTER pdpa_accepted_at;
-- Walk-in system user (lib/walk-in.ts): owns counter bookings and payments of customers without a
-- LINE account. Its LINE id can never collide with a real one (LINE ids start with "U").
INSERT IGNORE INTO users (line_user_id, display_name, member_code, status)
VALUES ('system:walk-in', 'ลูกค้าหน้าเคาน์เตอร์', 'WALK-IN', 'active');
ALTER TABLE payments ADD UNIQUE KEY IF NOT EXISTS uq_payments_user_request (user_id, request_id);

-- Receipts (lib/receipts.ts): one number per paid payment, RC<Buddhist year>-<6 digits>, counted per
-- Bangkok year in receipt_sequences inside the issuing transaction (no gaps, no shared numbers).
CREATE TABLE IF NOT EXISTS receipt_sequences (
  year SMALLINT UNSIGNED NOT NULL,
  last_no INT UNSIGNED NOT NULL,
  PRIMARY KEY (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_receipts (
  payment_id BIGINT UNSIGNED NOT NULL,
  receipt_no VARCHAR(24) NOT NULL,
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  issued_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (payment_id),
  UNIQUE KEY uq_payment_receipts_no (receipt_no),
  CONSTRAINT fk_payment_receipts_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  coin_balance INT NOT NULL DEFAULT 0,
  point_balance INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wallet_user (user_id),
  CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('topup','payment','refund','coin_earn','coin_redeem','point_earn','point_redeem') NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  coin_delta INT NOT NULL DEFAULT 0,
  point_delta INT NOT NULL DEFAULT 0,
  ref_type VARCHAR(40) NULL,
  ref_id BIGINT UNSIGNED NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wallet_ledger_user (user_id, created_at),
  CONSTRAINT fk_wallet_ledger_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coupons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  total_uses INT NOT NULL DEFAULT 1,
  validity_days INT NOT NULL DEFAULT 30,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_coupons_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0 AFTER active;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS metadata JSON NULL AFTER sort_order;

CREATE TABLE IF NOT EXISTS user_coupons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  coupon_id BIGINT UNSIGNED NOT NULL,
  remaining_uses INT NOT NULL,
  expires_at DATETIME NOT NULL,
  status ENUM('active','used','expired','cancelled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_coupons_user (user_id, status),
  CONSTRAINT fk_user_coupons_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_coupons_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Snapshot of the purchased quantity (coupon definitions may change later) and its payment.
ALTER TABLE user_coupons ADD COLUMN IF NOT EXISTS total_uses INT NULL AFTER coupon_id;
ALTER TABLE user_coupons ADD COLUMN IF NOT EXISTS payment_id BIGINT UNSIGNED NULL AFTER total_uses;

CREATE TABLE IF NOT EXISTS trainers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  nickname VARCHAR(80) NOT NULL,
  role VARCHAR(120) NOT NULL,
  avatar VARCHAR(16) NOT NULL,
  image_url TEXT NULL,
  experience VARCHAR(40) NOT NULL,
  zodiac VARCHAR(40) NULL,
  birth_year INT NULL,
  blood_type VARCHAR(8) NULL,
  contact_phone VARCHAR(32) NULL,
  bio TEXT NULL,
  specialties JSON NULL,
  packages JSON NULL,
  weekly_schedule JSON NULL,
  social_line VARCHAR(120) NULL,
  start_price DECIMAL(10,2) NOT NULL,
  certifications JSON NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_trainers_slug (slug),
  KEY idx_trainers_active_sort (active, sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE trainers ADD COLUMN IF NOT EXISTS image_url TEXT NULL AFTER avatar;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS zodiac VARCHAR(40) NULL AFTER experience;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS birth_year INT NULL AFTER zodiac;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS blood_type VARCHAR(8) NULL AFTER birth_year;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(32) NULL AFTER blood_type;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS bio TEXT NULL AFTER contact_phone;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS specialties JSON NULL AFTER bio;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS packages JSON NULL AFTER specialties;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS weekly_schedule JSON NULL AFTER packages;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS social_line VARCHAR(120) NULL AFTER weekly_schedule;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0 AFTER active;
ALTER TABLE trainers ADD INDEX IF NOT EXISTS idx_trainers_active_sort (active, sort_order, id);

CREATE TABLE IF NOT EXISTS groups_clubs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  sport_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  level_name VARCHAR(80) NOT NULL,
  description TEXT NULL,
  status ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_groups_sport (sport_id, status),
  CONSTRAINT fk_groups_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
  CONSTRAINT fk_groups_sport FOREIGN KEY (sport_id) REFERENCES sports(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE groups_clubs ADD COLUMN IF NOT EXISTS max_players INT NOT NULL DEFAULT 4 AFTER level_name;
ALTER TABLE groups_clubs ADD COLUMN IF NOT EXISTS play_at DATETIME NULL AFTER max_players;
ALTER TABLE groups_clubs ADD INDEX IF NOT EXISTS idx_groups_open (status, play_at);

-- Players in a Find Your Game slot. The owner is always the first member.
CREATE TABLE IF NOT EXISTS group_members (
  group_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
  KEY idx_group_members_user (user_id),
  CONSTRAINT fk_group_members_group FOREIGN KEY (group_id) REFERENCES groups_clubs(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_members_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO group_members (group_id, user_id, joined_at)
SELECT id, owner_user_id, created_at FROM groups_clubs;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  status ENUM('unread','read') NOT NULL DEFAULT 'unread',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id, status, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reminders already sent by the scheduled job (lib/scheduled-jobs.ts): one per booking
-- (booking_soon) and one per membership (membership_ending), never repeated.
CREATE TABLE IF NOT EXISTS member_reminders (
  kind VARCHAR(32) NOT NULL,
  ref_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kind, ref_id),
  KEY idx_member_reminders_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_content_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  content_type VARCHAR(64) NOT NULL,
  slug VARCHAR(96) NOT NULL,
  title VARCHAR(180) NOT NULL,
  subtitle VARCHAR(255) NULL,
  body TEXT NULL,
  icon VARCHAR(16) NOT NULL DEFAULT '📌',
  image_url TEXT NULL,
  action_label VARCHAR(80) NULL,
  target_screen VARCHAR(64) NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  metadata JSON NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_content_type_slug (content_type, slug),
  KEY idx_app_content_active_sort (content_type, active, sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seeds are insert-only: re-running db:init (required for schema changes) never reverts
-- names, prices, schedules or active flags edited in AdminConsole.
INSERT IGNORE INTO sports (slug, name_th, icon, description, requires_booking, base_rate, sort_order)
VALUES
  ('gym', 'Gym & HYROX', '🏋️', 'ใช้ได้ทันที ไม่ต้องจอง', FALSE, 0, 10),
  ('pool', 'สระว่ายน้ำ', '🏊', 'ใช้ได้ทันที', FALSE, 0, 20),
  ('badminton', 'แบดมินตัน', '🏸', '10 สนาม · Buffet Rank · ก๊วน', TRUE, 200, 30),
  ('tennis', 'เทนนิส', '🎾', '4 สนาม · โค้ช · คูปอง', TRUE, 350, 40),
  ('basketball', 'บาสเกตบอล', '🏀', 'Full/Half court และ Open Run', TRUE, 400, 50),
  ('volleyball', 'วอลเลย์บอล', '🏐', 'ใช้สนามร่วมกับบาสเกตบอล', TRUE, 400, 60),
  ('pickleball', 'พิคเคิลบอล', '🥒', '6 สนาม · Buffet Rank', TRUE, 250, 70),
  ('padel', 'พาเดล', '🎯', '2 สนาม', TRUE, 600, 80),
  ('pilates', 'Pilates', '🤸', 'Private และ Group', TRUE, 900, 90),
  ('airfit', 'Airfit', '🪂', 'Private และ Group Class', TRUE, 199, 100);

INSERT IGNORE INTO courts (sport_id, name, zone, capacity)
SELECT s.id, CONCAT('สนาม ', n.n), 'Main', CASE WHEN s.slug IN ('basketball','volleyball') THEN 12 ELSE 4 END
FROM sports s
JOIN (
  SELECT 1 n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
  UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10
) n
WHERE (s.slug = 'badminton' AND n.n <= 10)
   OR (s.slug = 'tennis' AND n.n <= 4)
   OR (s.slug = 'pickleball' AND n.n <= 6)
   OR (s.slug = 'padel' AND n.n <= 2)
   OR (s.slug IN ('basketball','volleyball') AND n.n <= 2);

INSERT IGNORE INTO coupons (code, name, category, price, total_uses, validity_days)
VALUES
  ('FIT-DROPIN', 'Fitness Day Pass', 'fitness', 299, 1, 30),
  ('HYROX-CLASS-5', 'Hyrox Class 5 ครั้ง', 'hyrox', 3500, 5, 45),
  ('PILATES-GROUP-10', 'Pilates Group 10 ครั้ง', 'pilates', 8500, 10, 60),
  ('TENNIS-COACH-DAY-10', 'เทนนิส Coach กลางวัน 10 ครั้ง', 'tennis', 11000, 10, 60);

-- Fitness coupon packs shown in the package page Coupon tab. Insert-only so that
-- prices and badges edited in AdminConsole survive later db:init runs.
INSERT IGNORE INTO coupons (code, name, category, price, total_uses, validity_days, active, sort_order, metadata)
VALUES
  ('FIT-COUPON-10', 'คูปอง Fitness 10 ใบ', 'fitness', 1600, 10, 60, TRUE, 10, '{"tab":"coupon","group":"c10","variant":"base","label":"Fitness"}'),
  ('FIT-SWIM-COUPON-10', 'คูปอง Fitness + Swim 10 ใบ', 'fitness-swim', 2400, 10, 60, TRUE, 11, '{"tab":"coupon","group":"c10","variant":"swim","label":"Fitness + Swim"}'),
  ('FIT-HYROX-COUPON-10', 'คูปอง Fitness + Hyrox 10 ใบ', 'fitness-hyrox', 2400, 10, 60, TRUE, 12, '{"tab":"coupon","group":"c10","variant":"hyrox","label":"Fitness + Hyrox"}'),
  ('FIT-COUPON-30', 'คูปอง Fitness 30 ใบ', 'fitness', 4200, 30, 120, TRUE, 20, '{"tab":"coupon","group":"c30","variant":"base","label":"Fitness"}'),
  ('FIT-SWIM-COUPON-30', 'คูปอง Fitness + Swim 30 ใบ', 'fitness-swim', 6300, 30, 120, TRUE, 21, '{"tab":"coupon","group":"c30","variant":"swim","label":"Fitness + Swim"}'),
  ('FIT-HYROX-COUPON-30', 'คูปอง Fitness + Hyrox 30 ใบ', 'fitness-hyrox', 6300, 30, 120, TRUE, 22, '{"tab":"coupon","group":"c30","variant":"hyrox","label":"Fitness + Hyrox"}'),
  ('FIT-COUPON-60', 'คูปอง Fitness 60 ใบ', 'fitness', 7200, 60, 180, TRUE, 30, '{"tab":"coupon","group":"c60","variant":"base","label":"Fitness"}'),
  ('FIT-SWIM-COUPON-60', 'คูปอง Fitness + Swim 60 ใบ', 'fitness-swim', 12000, 60, 180, TRUE, 31, '{"tab":"coupon","group":"c60","variant":"swim","label":"Fitness + Swim"}'),
  ('FIT-HYROX-COUPON-60', 'คูปอง Fitness + Hyrox 60 ใบ', 'fitness-hyrox', 12000, 60, 180, TRUE, 32, '{"tab":"coupon","group":"c60","variant":"hyrox","label":"Fitness + Hyrox"}'),
  ('FIT-COUPON-120', 'คูปอง Fitness 120 ใบ', 'fitness', 12000, 120, 365, TRUE, 40, '{"tab":"coupon","group":"c120","variant":"base","label":"Fitness","badge":"BEST SELLER"}'),
  ('FIT-SWIM-COUPON-120', 'คูปอง Fitness + Swim 120 ใบ', 'fitness-swim', 18000, 120, 365, TRUE, 41, '{"tab":"coupon","group":"c120","variant":"swim","label":"Fitness + Swim"}'),
  ('FIT-HYROX-COUPON-120', 'คูปอง Fitness + Hyrox 120 ใบ', 'fitness-hyrox', 18000, 120, 365, TRUE, 42, '{"tab":"coupon","group":"c120","variant":"hyrox","label":"Fitness + Hyrox"}');

INSERT IGNORE INTO trainers (slug, name, nickname, role, avatar, experience, zodiac, birth_year, blood_type, contact_phone, bio, specialties, packages, weekly_schedule, social_line, start_price, certifications, sort_order)
VALUES
  ('alex', 'Alex Tan', 'อเล็กซ์', 'HYROX Coach', '🧑‍🦱', '6 ปี', 'เมษ', 2535, 'O', '02-123-4567', 'โค้ช HYROX และ functional training สำหรับสมาชิกที่ต้องการพัฒนา endurance, strength และ race pace แบบเป็นระบบ', JSON_ARRAY('HYROX','Functional Training','Weight Loss'), JSON_ARRAY(JSON_OBJECT('title','รายวัน','text','1 ครั้ง · 1 ชม.','price',1500),JSON_OBJECT('title','รายสัปดาห์','text','5 ครั้ง/สัปดาห์','price',6750),JSON_OBJECT('title','รายเดือน','text','20 ครั้ง/เดือน','price',25000)), JSON_ARRAY(JSON_OBJECT('day','จันทร์','date','13','slots',JSON_ARRAY(JSON_OBJECT('time','08:00','status','available'),JSON_OBJECT('time','18:00','status','available'))),JSON_OBJECT('day','พุธ','date','15','slots',JSON_ARRAY(JSON_OBJECT('time','09:30','status','available'),JSON_OBJECT('time','19:30','status','full'))),JSON_OBJECT('day','เสาร์','date','18','slots',JSON_ARRAY(JSON_OBJECT('time','11:00','status','available'),JSON_OBJECT('time','16:00','status','available')))), '@ppa_alex', 1500, JSON_ARRAY('HYROX Master Trainer Academy','NASM Certified Personal Trainer'), 10),
  ('chai', 'สมชาย ใจดี', 'โค้ชชาย', 'Strength & Conditioning', '🧔', '10 ปี', 'สิงห์', 2529, 'B', '02-123-4567', 'วางโปรแกรม strength and conditioning สำหรับนักกีฬาและผู้เริ่มต้น โดยเน้นท่าปลอดภัยและ progression ที่วัดผลได้', JSON_ARRAY('Strength','Conditioning','Athlete Performance'), JSON_ARRAY(JSON_OBJECT('title','รายวัน','text','1 ครั้ง · 1 ชม.','price',1300),JSON_OBJECT('title','รายสัปดาห์','text','5 ครั้ง/สัปดาห์','price',5850),JSON_OBJECT('title','รายเดือน','text','20 ครั้ง/เดือน','price',21700)), JSON_ARRAY(JSON_OBJECT('day','อังคาร','date','14','slots',JSON_ARRAY(JSON_OBJECT('time','08:00','status','available'),JSON_OBJECT('time','17:00','status','available'))),JSON_OBJECT('day','พฤหัสฯ','date','16','slots',JSON_ARRAY(JSON_OBJECT('time','11:00','status','full'),JSON_OBJECT('time','18:00','status','available'))),JSON_OBJECT('day','อาทิตย์','date','19','slots',JSON_ARRAY(JSON_OBJECT('time','09:30','status','available'),JSON_OBJECT('time','14:00','status','available')))), '@ppa_chai', 1300, JSON_ARRAY('ACE Certified Personal Trainer','FIT Thailand Strength Course'), 20),
  ('mind', 'วรินทร สุขใจ', 'ครูมายด์', 'Pilates Instructor', '👩‍🦰', '4 ปี', 'ตุล', 2538, 'A', '02-123-4567', 'ครู Pilates สำหรับ posture, core strength และ mobility เหมาะกับสมาชิกที่ต้องการฟื้นฟูร่างกายอย่างนุ่มนวล', JSON_ARRAY('Pilates','Mobility','Posture'), JSON_ARRAY(JSON_OBJECT('title','Private','text','1 ครั้ง · Reformer/Mat','price',1200),JSON_OBJECT('title','Duo','text','2 คน · 1 ชม.','price',2000),JSON_OBJECT('title','10 Sessions','text','แพ็ก 10 ครั้ง','price',10500)), JSON_ARRAY(JSON_OBJECT('day','จันทร์','date','13','slots',JSON_ARRAY(JSON_OBJECT('time','09:30','status','available'),JSON_OBJECT('time','14:00','status','available'))),JSON_OBJECT('day','ศุกร์','date','17','slots',JSON_ARRAY(JSON_OBJECT('time','11:00','status','available'),JSON_OBJECT('time','18:00','status','full'))),JSON_OBJECT('day','เสาร์','date','18','slots',JSON_ARRAY(JSON_OBJECT('time','08:00','status','available'),JSON_OBJECT('time','15:30','status','available')))), '@ppa_mind', 1200, JSON_ARRAY('STOTT Pilates','AFAA Group Fitness'), 30),
  ('may', 'ณัฐธิดา พรหมมา', 'ครูเมย์', 'Yoga Instructor', '🧘‍♀️', '7 ปี', 'มีน', 2532, 'AB', '02-123-4567', 'สอน yoga, breathwork และ recovery class สำหรับสมดุลร่างกายหลังฝึกหนัก', JSON_ARRAY('Yoga','Recovery','Breathwork'), JSON_ARRAY(JSON_OBJECT('title','Drop-in','text','1 ครั้ง · 75 นาที','price',1000),JSON_OBJECT('title','5 Sessions','text','แพ็ก 5 ครั้ง','price',4500),JSON_OBJECT('title','Monthly','text','คลาสส่วนตัวรายเดือน','price',16000)), JSON_ARRAY(JSON_OBJECT('day','อังคาร','date','14','slots',JSON_ARRAY(JSON_OBJECT('time','08:00','status','available'),JSON_OBJECT('time','19:30','status','available'))),JSON_OBJECT('day','พฤหัสฯ','date','16','slots',JSON_ARRAY(JSON_OBJECT('time','09:30','status','available'),JSON_OBJECT('time','16:00','status','full'))),JSON_OBJECT('day','อาทิตย์','date','19','slots',JSON_ARRAY(JSON_OBJECT('time','11:00','status','available'),JSON_OBJECT('time','18:00','status','available')))), '@ppa_may', 1000, JSON_ARRAY('RYT-200 Yoga Alliance','Yin Yoga Certification'), 40),
  ('zack', 'Zack Lee', 'แซค', 'CrossFit Coach', '🧑‍🦲', '8 ปี', 'ธนู', 2533, 'O', '02-123-4567', 'โค้ช CrossFit และ metabolic conditioning สำหรับผู้ที่ต้องการเพิ่ม power, agility และ body composition', JSON_ARRAY('CrossFit','Metcon','Power'), JSON_ARRAY(JSON_OBJECT('title','รายวัน','text','1 ครั้ง · 1 ชม.','price',1400),JSON_OBJECT('title','รายสัปดาห์','text','5 ครั้ง/สัปดาห์','price',6300),JSON_OBJECT('title','รายเดือน','text','20 ครั้ง/เดือน','price',23400)), JSON_ARRAY(JSON_OBJECT('day','พุธ','date','15','slots',JSON_ARRAY(JSON_OBJECT('time','08:00','status','available'),JSON_OBJECT('time','18:00','status','available'))),JSON_OBJECT('day','ศุกร์','date','17','slots',JSON_ARRAY(JSON_OBJECT('time','14:00','status','available'),JSON_OBJECT('time','20:30','status','full'))),JSON_OBJECT('day','เสาร์','date','18','slots',JSON_ARRAY(JSON_OBJECT('time','09:30','status','available'),JSON_OBJECT('time','17:00','status','available')))), '@ppa_zack', 1400, JSON_ARRAY('CrossFit Level 2 Trainer','TRX Suspension Training'), 50);

INSERT IGNORE INTO app_content_items (content_type, slug, title, subtitle, body, icon, action_label, target_screen, price, metadata, sort_order)
VALUES
  ('home_slide', 'hyrox-challenge-2026', 'PPA HYROX Challenge 2026', 'สมัครแข่งวันนี้ - 30 มิ.ย. · รับเสื้อ Finisher ฟรี', 'อีเวนต์แข่งขัน HYROX สำหรับสมาชิกและบุคคลทั่วไป', '🏆', 'สมัคร', 'hyrox', 0, JSON_OBJECT('tag','EVENT','tone','event'), 10),
  ('home_slide', 'badminton-shop-deal', 'รองเท้าแบด ลดสูงสุด 40%', 'PPA Pro Shop · เฉพาะสมาชิก ถึง 31 พ.ค.', 'ดีลอุปกรณ์กีฬาในคลับสำหรับสมาชิก PPA', '🛍️', 'ดูดีล', 'promotion', 0, JSON_OBJECT('tag','PROMOTION','tone','shop'), 20),
  ('home_slide', 'ppa-cafe-deal', 'ส่วนลดร้านอาหาร 15%', 'PPA Cafe & Restaurant · โชว์ QR สมาชิกรับสิทธิ์', 'ส่วนลดอาหารและเครื่องดื่มหลังเล่นกีฬา', '🍜', 'รับสิทธิ์', 'coupon', 0, JSON_OBJECT('tag','FOOD','tone','food'), 30),
  ('home_slide', 'airfit-trial', 'เปิดคลาส Airfit ใหม่', 'ทดลองเรียนครั้งแรก 199 ฿ · จองผ่านแอปเท่านั้น', 'คลาส Airfit สำหรับผู้เริ่มต้นและผู้เล่นประจำ', '🪂', 'จอง', 'airfit', 199, JSON_OBJECT('tag','NEW','tone','airfit'), 40),
  ('service_package', 'fitness-pack', 'Fitness Pack', 'Day pass, monthly access และ PT starter', 'เข้าใช้ Fitness และบริการเสริมของ Gymnos', '💪', 'ซื้อแพ็กเกจ', 'fitness', 299, JSON_OBJECT('category','gymnos'), 10),
  ('service_package', 'hyrox-simulation', 'HYROX Simulation', 'แข่งจำลองพร้อม coach station', 'ซ้อมสนามจำลอง HYROX พร้อมโค้ชประจำ station', '🔥', 'จองคลาส', 'hyrox', 1300, JSON_OBJECT('category','hyrox'), 20),
  ('service_package', 'pilates-group-10', 'Pilates Group 10', 'Reformer group class 10 ครั้ง', 'แพ็กเกจ Pilates group สำหรับสมาชิก', '🤸', 'ซื้อคูปอง', 'pilates', 8500, JSON_OBJECT('category','pilates'), 30),
  ('service_package', 'airfit-trial-class', 'Airfit Trial', 'ทดลองเรียน 1 ครั้ง', 'คลาสทดลอง Airfit แบบจองล่วงหน้า', '🪂', 'จองทดลอง', 'airfit', 199, JSON_OBJECT('category','airfit'), 40),
  ('live_tv', 'arena-court-a', 'Court A Live', 'กำลังถ่ายทอด', 'Basketball Open Run · Court A', '🏀', 'ดูสด', 'livetv', 0, JSON_OBJECT('status','live','zone','Court A'), 10),
  ('live_tv', 'badminton-buffet-rank', 'Badminton Buffet Rank', 'เริ่ม 18:00', 'ถ่ายทอดสดกิจกรรม Buffet Rank', '🏸', 'ดูรายการ', 'livetv', 0, JSON_OBJECT('status','scheduled','zone','Main'), 20),
  ('live_tv', 'hyrox-training-replay', 'HYROX Training', 'Replay ล่าสุด', 'ย้อนหลังการซ้อม HYROX', '🔥', 'ดูย้อนหลัง', 'livetv', 0, JSON_OBJECT('status','replay','zone','Arena'), 30),
  ('class_schedule', 'hyrox-evening', 'HYROX Class', '18:30 · ว่าง', 'คลาส HYROX รอบเย็น', '🔥', 'จอง', 'hyrox', 700, JSON_OBJECT('time','18:30','status','available'), 10),
  ('class_schedule', 'pilates-reformer', 'Pilates Reformer', '15:30 · ว่าง', 'Reformer group class', '🤸', 'จอง', 'pilates', 950, JSON_OBJECT('time','15:30','status','available'), 20),
  ('class_schedule', 'airfit-trial-slot', 'Airfit Trial', '17:00 · ว่าง', 'ทดลองเรียน Airfit', '🪂', 'จอง', 'airfit', 199, JSON_OBJECT('time','17:00','status','available'), 30),
  ('feature_screen', 'classhub', 'คลาสออกกำลังกาย', 'รวม Yoga, Pilates, HYROX, Airfit และบริการเสริม', 'เลือกคลาสและแพ็กเกจจากข้อมูลที่จัดการในหลังบ้าน', '🧘', 'ดูคลาส', 'classhub', 0, JSON_OBJECT('screens',JSON_ARRAY('svcclass','svcdetail','classes','classschedule')), 10),
  ('feature_screen', 'profile-tools', 'ข้อมูลสมาชิก', 'Personal, Visits, Buy History, Coupons, Status และ Notification Settings', 'หน้าสมาชิกเชื่อมกับข้อมูลจริงของผู้ใช้และรายการซื้อในระบบ', '👤', 'จัดการ', 'profile', 0, JSON_OBJECT('screens',JSON_ARRAY('personal','visits','buyhistory','mycoupons','mystatus','notisettings')), 20),
  ('feature_screen', 'groups-kuan', 'Find Your Game & Buffet Rank', 'Open Run, ก๊วน, Ranking, Vote และ Reward', 'ระบบก๊วนเชื่อมการสร้างกลุ่มจริง ส่วน ranking/vote/reward แสดงเป็น managed feature พร้อมต่อ backend เฉพาะได้', '👥', 'เปิด', 'groups', 0, JSON_OBJECT('screens',JSON_ARRAY('orprofile','kuanprofile','groupcreate','groupdetail','groupchat','groupranking','kuanvote','kuanresult','kuanredeem','playerprofile','coinshop','kuanroster','kuanpairs')), 30);

-- Package page catalog (Monthly / Time tabs and Renew options). Insert-only: prices,
-- labels and grant terms edited in AdminConsole are kept on later db:init runs.
-- Grant terms (months/days/uses/services/pausesAllowed) are read by the server at
-- checkout and copied into the payment, so later edits never change paid rights.
INSERT IGNORE INTO app_content_items (content_type, slug, title, subtitle, body, icon, action_label, target_screen, price, metadata, sort_order)
VALUES
  ('membership_plan', 'fitness-12m', 'Fitness (12 เดือน)', NULL, 'แพ็กเกจ Fitness รายปี เข้าใช้ไม่จำกัด', '🏋️', 'เลือกแพ็กเกจนี้', 'plans', 19200, '{"tab":"monthly","group":"12m","variant":"base","label":"Fitness (12 เดือน)","featured":true,"badge":"คุ้มสุด","perks":["เข้าใช้ไม่จำกัดตลอด 12 เดือน","เข้าใช้ฟิตเนสไม่จำกัด","จองผ่านแอปได้ทันที"],"months":12,"pausesAllowed":2,"services":["fitness"]}', 110),
  ('membership_plan', 'fitness-swim-12m', 'Fitness + Swim 12 เดือน', NULL, NULL, '🏊', NULL, 'plans', 19700, '{"tab":"monthly","group":"12m","variant":"swim","label":"Fitness + Swim","months":12,"pausesAllowed":2,"services":["fitness","swim"]}', 111),
  ('membership_plan', 'fitness-hyrox-12m', 'Fitness + Hyrox 12 เดือน', NULL, NULL, '🔥', NULL, 'plans', 19700, '{"tab":"monthly","group":"12m","variant":"hyrox","label":"Fitness + Hyrox","months":12,"pausesAllowed":2,"services":["fitness","hyrox"]}', 112),
  ('membership_plan', 'fitness-1m', 'Fitness 1 เดือน', 'เข้าใช้ไม่จำกัด', NULL, '🏋️', NULL, 'plans', 2000, '{"tab":"monthly","group":"1m","variant":"base","label":"1 เดือน","months":1,"pausesAllowed":0,"services":["fitness"]}', 120),
  ('membership_plan', 'fitness-swim-1m', 'Fitness + Swim 1 เดือน', NULL, NULL, '🏊', NULL, 'plans', 2700, '{"tab":"monthly","group":"1m","variant":"swim","label":"Fitness + Swim","months":1,"pausesAllowed":0,"services":["fitness","swim"]}', 121),
  ('membership_plan', 'fitness-hyrox-1m', 'Fitness + Hyrox 1 เดือน', NULL, NULL, '🔥', NULL, 'plans', 2700, '{"tab":"monthly","group":"1m","variant":"hyrox","label":"Fitness + Hyrox","months":1,"pausesAllowed":0,"services":["fitness","hyrox"]}', 122),
  ('membership_plan', 'fitness-6m', 'Fitness 6 เดือน', NULL, NULL, '🏋️', NULL, 'plans', 10885, '{"tab":"monthly","group":"6m","variant":"base","label":"6 เดือน","months":6,"pausesAllowed":1,"services":["fitness"]}', 130),
  ('membership_plan', 'fitness-swim-6m', 'Fitness + Swim 6 เดือน', NULL, NULL, '🏊', NULL, 'plans', 11485, '{"tab":"monthly","group":"6m","variant":"swim","label":"Fitness + Swim","months":6,"pausesAllowed":1,"services":["fitness","swim"]}', 131),
  ('membership_plan', 'fitness-hyrox-6m', 'Fitness + Hyrox 6 เดือน', NULL, NULL, '🔥', NULL, 'plans', 11485, '{"tab":"monthly","group":"6m","variant":"hyrox","label":"Fitness + Hyrox","months":6,"pausesAllowed":1,"services":["fitness","hyrox"]}', 132),
  ('time_pass', 'fitness-1-visit', 'Fitness 1 ครั้ง', 'ใช้ได้ 1 วัน', NULL, '🎫', NULL, 'plans', 200, '{"tab":"time","group":"1d","variant":"base","label":"1 ครั้ง","days":1,"uses":1,"services":["fitness"]}', 10),
  ('time_pass', 'fitness-swim-1-visit', 'Fitness + Swim 1 ครั้ง', NULL, NULL, '🏊', NULL, 'plans', 300, '{"tab":"time","group":"1d","variant":"swim","label":"Fitness + Swim","days":1,"uses":1,"services":["fitness","swim"]}', 11),
  ('time_pass', 'fitness-hyrox-1-visit', 'Fitness + Hyrox 1 ครั้ง', NULL, NULL, '🔥', NULL, 'plans', 300, '{"tab":"time","group":"1d","variant":"hyrox","label":"Fitness + Hyrox","days":1,"uses":1,"services":["fitness","hyrox"]}', 12),
  ('time_pass', 'fitness-1-week', 'Fitness 1 สัปดาห์', NULL, NULL, '🎫', NULL, 'plans', 1000, '{"tab":"time","group":"1w","variant":"base","label":"1 สัปดาห์","days":7,"services":["fitness"]}', 20),
  ('time_pass', 'fitness-swim-1-week', 'Fitness + Swim 1 สัปดาห์', NULL, NULL, '🏊', NULL, 'plans', 1500, '{"tab":"time","group":"1w","variant":"swim","label":"Fitness + Swim","days":7,"services":["fitness","swim"]}', 21),
  ('time_pass', 'fitness-hyrox-1-week', 'Fitness + Hyrox 1 สัปดาห์', NULL, NULL, '🔥', NULL, 'plans', 1500, '{"tab":"time","group":"1w","variant":"hyrox","label":"Fitness + Hyrox","days":7,"services":["fitness","hyrox"]}', 22),
  ('renewal_option', 'package-pause', 'พักการใช้งานแพ็กเกจ', 'หยุดนับอายุแพ็กเกจชั่วคราว สูงสุดไม่เกิน 2 เดือนต่อครั้ง เมื่อกลับมาใช้ วันที่เหลือจะต่อจากเดิม', 'แพ็กเกจ 6 เดือนหยุดได้ 1 ครั้ง · แพ็กเกจรายปี (12 เดือน) หยุดได้ 2 ครั้ง', '⏸️', 'ขอพักการใช้งาน', 'plans', 500, '{"kind":"membership_pause","maxDays":60}', 10),
  ('renewal_option', 'coupon-renewal', 'ต่ออายุคูปอง', 'ขยายวันหมดอายุคูปองออกไปอีก 1 เดือน โดยจำนวนครั้งคงเหลือเท่าเดิม (ใช้ได้เฉพาะคูปองเท่านั้น ไม่รวมแพ็กเกจ)', NULL, '⏳', 'ต่ออายุคูปอง', 'plans', 500, '{"kind":"coupon_renewal","months":1}', 20);

-- Coin rewards redeemed via /api/rewards/redeem, metadata.cost is the price in coins. Insert-only.
INSERT IGNORE INTO app_content_items (content_type, slug, title, subtitle, body, icon, action_label, target_screen, price, metadata, sort_order)
VALUES
  ('reward', 'reward-water', 'น้ำเปล่า PPA', '1 ขวด', NULL, '💧', 'แลก', 'reward', 0, '{"cost":5}', 10),
  ('reward', 'reward-towel', 'ผ้าขนหนูกีฬา', 'ลาย PPA สุดพิเศษ', NULL, '🧺', 'แลก', 'reward', 0, '{"cost":15}', 20),
  ('reward', 'reward-shuttlecock', 'ลูกแบดมินตัน', '1 หลอด (12 ลูก)', NULL, '🏸', 'แลก', 'reward', 0, '{"cost":20}', 30),
  ('reward', 'reward-court-hour', 'คูปองเช่าคอร์ทฟรี', 'ใช้ได้ 1 ชม. ทุกกีฬา', NULL, '🎫', 'แลก', 'reward', 0, '{"cost":30}', 40),
  ('reward', 'reward-shirt', 'เสื้อกีฬา PPA', 'เลือกไซส์ได้ที่เคาน์เตอร์', NULL, '👕', 'แลก', 'reward', 0, '{"cost":50}', 50);

-- Site settings read by the member app. Insert-only, edit them in AdminConsole (content type site_setting).
-- support-contact: phone, email, LINE ID/link and opening hours on the Help page.
INSERT IGNORE INTO app_content_items (content_type, slug, title, subtitle, body, icon, action_label, target_screen, price, metadata, sort_order)
VALUES
  ('site_setting', 'support-contact', 'ช่วยเหลือ & ติดต่อเรา', 'PPA Power Play Sport Club', NULL, '❓', NULL, 'help', 0, '{"phone":"02-123-4567","email":"support@ppapowerplay.com","line":"@ppapowerplay","lineUrl":"https://line.me/R/ti/p/@ppapowerplay","hours":"08:00-21:00"}', 10);

-- receipt-info: header printed on receipts (business name, branch, address, 13-digit tax ID, phone,
-- vatRegistered for an abbreviated tax invoice, footer). Read by receipts only, so it is seeded OFF:
-- active items are sent to the member app and this one is not for members.
INSERT IGNORE INTO app_content_items (content_type, slug, title, subtitle, body, icon, action_label, target_screen, price, metadata, active, sort_order)
VALUES
  ('site_setting', 'receipt-info', 'ข้อมูลหัวใบเสร็จ', 'ใช้พิมพ์ใบเสร็จ ไม่ต้องเปิดใช้งาน', NULL, '🧾', NULL, NULL, 0, '{"businessName":"PPA Power Play Sport Club","branch":"สำนักงานใหญ่","address":"","taxId":"","phone":"","vatRegistered":false,"footer":"ขอบคุณที่ใช้บริการ"}', FALSE, 30);

-- privacy-policy: PDPA notice members accept in the app. Seeded OFF as a draft. The owner reviews the text,
-- keeps or changes metadata.version, then activates it. Members are asked again whenever the version changes.
INSERT IGNORE INTO app_content_items (content_type, slug, title, subtitle, body, icon, action_label, target_screen, price, metadata, active, sort_order)
VALUES
  ('site_setting', 'privacy-policy', 'นโยบายความเป็นส่วนตัว', 'PPA Power Play Sport Club เก็บและใช้ข้อมูลส่วนบุคคลของคุณเพื่อให้บริการสมาชิก การจอง และการชำระเงิน ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562', '1. ข้อมูลที่เราเก็บ: ข้อมูลโปรไฟล์ LINE (รหัสผู้ใช้ ชื่อที่แสดง รูปโปรไฟล์) เบอร์โทรศัพท์และอีเมลหากคุณให้ไว้ ประวัติการจอง แพ็กเกจ คูปอง การชำระเงิน สลิปการโอนเงิน และประวัติการเข้าใช้บริการ
2. วัตถุประสงค์: ยืนยันตัวตนและให้บริการสมาชิก จัดการการจองและสิทธิ์การใช้บริการ ตรวจสอบการชำระเงิน แจ้งข่าวสารเกี่ยวกับบริการของคุณ และปฏิบัติตามกฎหมาย
3. การเปิดเผยข้อมูล: เราไม่ขายข้อมูลของคุณ และเปิดเผยเฉพาะผู้ให้บริการที่จำเป็นต่อการให้บริการ เช่น LINE และธนาคาร หรือเมื่อกฎหมายกำหนด
4. ระยะเวลาเก็บรักษา: ตลอดระยะเวลาที่เป็นสมาชิก และเก็บข้อมูลการเงินตามระยะเวลาที่กฎหมายบัญชีและภาษีกำหนด
5. สิทธิของคุณ: ขอเข้าถึง ขอสำเนา ขอแก้ไข ขอลบ ขอระงับ หรือคัดค้านการใช้ข้อมูล และถอนความยินยอมได้ โดยติดต่อเจ้าหน้าที่ตามช่องทางในหน้าช่วยเหลือ และมีสิทธิร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล', '🔒', 'ยอมรับ', NULL, 0, '{"version":"2026-11-01"}', FALSE, 20);

-- One-time data changes made by db:init. A row means the change already ran and must not repeat.
CREATE TABLE IF NOT EXISTS schema_markers (
  name VARCHAR(96) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Retire the original placeholder plans once, and only while they still carry their seeded
-- values. Plans an administrator edited or re-activated later are left alone by every later run.
UPDATE app_content_items
SET active = FALSE
WHERE content_type = 'membership_plan'
  AND NOT EXISTS (SELECT 1 FROM schema_markers WHERE name = 'retire-placeholder-plans')
  AND ((slug = 'monthly' AND title = 'แพ็กเกจ Monthly' AND price = 1900)
    OR (slug = 'quarterly' AND title = 'แพ็กเกจ Quarterly' AND price = 5100)
    OR (slug = 'annual' AND title = 'แพ็กเกจ Annual' AND price = 18000));
INSERT IGNORE INTO schema_markers (name) VALUES ('retire-placeholder-plans');

INSERT INTO admin_roles (code, name_th, name_en, description, level, is_system)
VALUES
  ('super_admin', 'ผู้ดูแลสูงสุด', 'Super Admin', 'Full system access for every admin function.', 100, TRUE),
  ('manager', 'ผู้จัดการ', 'Manager', 'Manage daily sport complex operations.', 70, TRUE),
  ('front_desk', 'พนักงานต้อนรับ', 'Front Desk', 'Check-in, bookings, members, and service support.', 40, TRUE),
  ('finance', 'การเงิน', 'Finance', 'Payments, refunds, reports, and finance operations.', 60, TRUE),
  ('trainer', 'เทรนเนอร์', 'Trainer', 'Trainer schedule and assigned member access.', 30, TRUE)
ON DUPLICATE KEY UPDATE
  name_th = VALUES(name_th),
  name_en = VALUES(name_en),
  description = VALUES(description),
  level = VALUES(level),
  is_system = VALUES(is_system);

INSERT INTO admin_permissions (code, name_th, name_en, group_key)
VALUES
  ('dashboard.view', 'ดู Dashboard', 'View dashboard', 'dashboard'),
  ('members.manage', 'จัดการสมาชิก', 'Manage members', 'members'),
  ('staff.manage', 'เพิ่ม แก้ไข ลบ พนักงาน', 'Create, update, delete staff', 'staff'),
  ('roles.manage', 'กำหนดสิทธิพนักงาน', 'Manage staff permissions', 'roles'),
  ('reports.view', 'ดูรายงาน', 'View reports', 'reports'),
  ('coupons.manage', 'จัดการคูปอง', 'Manage coupons', 'coupons'),
  ('bookings.manage', 'จัดการการจอง', 'Manage bookings', 'bookings'),
  ('trainers.manage', 'จัดการเทรนเนอร์', 'Manage trainers', 'trainers'),
  ('content.manage', 'จัดการเนื้อหาแอป', 'Manage app content', 'content'),
  ('payments.manage', 'จัดการการเงิน', 'Manage payments', 'payments'),
  ('sales.manage', 'ขายหน้าเคาน์เตอร์', 'Counter sales', 'sales'),
  ('settings.manage', 'ตั้งค่าระบบ', 'Manage system settings', 'settings')
ON DUPLICATE KEY UPDATE
  name_th = VALUES(name_th),
  name_en = VALUES(name_en),
  group_key = VALUES(group_key);

INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin_roles r
JOIN admin_permissions p
WHERE r.code = 'super_admin';

INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin_roles r
JOIN admin_permissions p ON p.code IN ('dashboard.view','members.manage','staff.manage','reports.view','coupons.manage','bookings.manage','trainers.manage','content.manage','sales.manage')
WHERE r.code = 'manager';

INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin_roles r
JOIN admin_permissions p ON p.code IN ('dashboard.view','members.manage','bookings.manage','coupons.manage','sales.manage')
WHERE r.code = 'front_desk';

INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin_roles r
JOIN admin_permissions p ON p.code IN ('dashboard.view','reports.view','payments.manage','sales.manage')
WHERE r.code = 'finance';

INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin_roles r
JOIN admin_permissions p ON p.code IN ('dashboard.view','trainers.manage')
WHERE r.code = 'trainer';

-- Bootstrap account only: an existing account's password, status and role are never
-- reset by db:init (password changes made in AdminConsole must survive deployments).
INSERT IGNORE INTO admin_staff (username, password_hash, display_name, email, phone, status, role_id)
SELECT 'zeroline',
  'scrypt:c246073c4f671011bd91222f7f9a9718:1d27a51caca268b201de5d033d83dc0e63fca5373d3dfc193170749eafa3a4e638843b15107949d419b5dfe411f0baf8bfb4ce77965f2cc3c1565d5023e60d99',
  'i''m zΞro',
  NULL,
  NULL,
  'active',
  r.id
FROM admin_roles r
WHERE r.code = 'super_admin';
