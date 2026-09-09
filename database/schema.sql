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

INSERT INTO sports (slug, name_th, icon, description, requires_booking, base_rate, sort_order)
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
  ('airfit', 'Airfit', '🪂', 'Private และ Group Class', TRUE, 199, 100)
ON DUPLICATE KEY UPDATE name_th = VALUES(name_th), base_rate = VALUES(base_rate), active = TRUE;

INSERT INTO courts (sport_id, name, zone, capacity)
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
   OR (s.slug IN ('basketball','volleyball') AND n.n <= 2)
ON DUPLICATE KEY UPDATE status = status;

INSERT INTO coupons (code, name, category, price, total_uses, validity_days)
VALUES
  ('FIT-DROPIN', 'Fitness Day Pass', 'fitness', 299, 1, 30),
  ('HYROX-CLASS-5', 'Hyrox Class 5 ครั้ง', 'hyrox', 3500, 5, 45),
  ('PILATES-GROUP-10', 'Pilates Group 10 ครั้ง', 'pilates', 8500, 10, 60),
  ('TENNIS-COACH-DAY-10', 'เทนนิส Coach กลางวัน 10 ครั้ง', 'tennis', 11000, 10, 60)
ON DUPLICATE KEY UPDATE price = VALUES(price), total_uses = VALUES(total_uses);

INSERT INTO trainers (slug, name, nickname, role, avatar, experience, zodiac, birth_year, blood_type, contact_phone, bio, specialties, packages, weekly_schedule, social_line, start_price, certifications, sort_order)
VALUES
  ('alex', 'Alex Tan', 'อเล็กซ์', 'HYROX Coach', '🧑‍🦱', '6 ปี', 'เมษ', 2535, 'O', '02-123-4567', 'โค้ช HYROX และ functional training สำหรับสมาชิกที่ต้องการพัฒนา endurance, strength และ race pace แบบเป็นระบบ', JSON_ARRAY('HYROX','Functional Training','Weight Loss'), JSON_ARRAY(JSON_OBJECT('title','รายวัน','text','1 ครั้ง · 1 ชม.','price',1500),JSON_OBJECT('title','รายสัปดาห์','text','5 ครั้ง/สัปดาห์','price',6750),JSON_OBJECT('title','รายเดือน','text','20 ครั้ง/เดือน','price',25000)), JSON_ARRAY(JSON_OBJECT('day','จันทร์','date','13','slots',JSON_ARRAY(JSON_OBJECT('time','08:00','status','available'),JSON_OBJECT('time','18:00','status','available'))),JSON_OBJECT('day','พุธ','date','15','slots',JSON_ARRAY(JSON_OBJECT('time','09:30','status','available'),JSON_OBJECT('time','19:30','status','full'))),JSON_OBJECT('day','เสาร์','date','18','slots',JSON_ARRAY(JSON_OBJECT('time','11:00','status','available'),JSON_OBJECT('time','16:00','status','available')))), '@ppa_alex', 1500, JSON_ARRAY('HYROX Master Trainer Academy','NASM Certified Personal Trainer'), 10),
  ('chai', 'สมชาย ใจดี', 'โค้ชชาย', 'Strength & Conditioning', '🧔', '10 ปี', 'สิงห์', 2529, 'B', '02-123-4567', 'วางโปรแกรม strength and conditioning สำหรับนักกีฬาและผู้เริ่มต้น โดยเน้นท่าปลอดภัยและ progression ที่วัดผลได้', JSON_ARRAY('Strength','Conditioning','Athlete Performance'), JSON_ARRAY(JSON_OBJECT('title','รายวัน','text','1 ครั้ง · 1 ชม.','price',1300),JSON_OBJECT('title','รายสัปดาห์','text','5 ครั้ง/สัปดาห์','price',5850),JSON_OBJECT('title','รายเดือน','text','20 ครั้ง/เดือน','price',21700)), JSON_ARRAY(JSON_OBJECT('day','อังคาร','date','14','slots',JSON_ARRAY(JSON_OBJECT('time','08:00','status','available'),JSON_OBJECT('time','17:00','status','available'))),JSON_OBJECT('day','พฤหัสฯ','date','16','slots',JSON_ARRAY(JSON_OBJECT('time','11:00','status','full'),JSON_OBJECT('time','18:00','status','available'))),JSON_OBJECT('day','อาทิตย์','date','19','slots',JSON_ARRAY(JSON_OBJECT('time','09:30','status','available'),JSON_OBJECT('time','14:00','status','available')))), '@ppa_chai', 1300, JSON_ARRAY('ACE Certified Personal Trainer','FIT Thailand Strength Course'), 20),
  ('mind', 'วรินทร สุขใจ', 'ครูมายด์', 'Pilates Instructor', '👩‍🦰', '4 ปี', 'ตุล', 2538, 'A', '02-123-4567', 'ครู Pilates สำหรับ posture, core strength และ mobility เหมาะกับสมาชิกที่ต้องการฟื้นฟูร่างกายอย่างนุ่มนวล', JSON_ARRAY('Pilates','Mobility','Posture'), JSON_ARRAY(JSON_OBJECT('title','Private','text','1 ครั้ง · Reformer/Mat','price',1200),JSON_OBJECT('title','Duo','text','2 คน · 1 ชม.','price',2000),JSON_OBJECT('title','10 Sessions','text','แพ็ก 10 ครั้ง','price',10500)), JSON_ARRAY(JSON_OBJECT('day','จันทร์','date','13','slots',JSON_ARRAY(JSON_OBJECT('time','09:30','status','available'),JSON_OBJECT('time','14:00','status','available'))),JSON_OBJECT('day','ศุกร์','date','17','slots',JSON_ARRAY(JSON_OBJECT('time','11:00','status','available'),JSON_OBJECT('time','18:00','status','full'))),JSON_OBJECT('day','เสาร์','date','18','slots',JSON_ARRAY(JSON_OBJECT('time','08:00','status','available'),JSON_OBJECT('time','15:30','status','available')))), '@ppa_mind', 1200, JSON_ARRAY('STOTT Pilates','AFAA Group Fitness'), 30),
  ('may', 'ณัฐธิดา พรหมมา', 'ครูเมย์', 'Yoga Instructor', '🧘‍♀️', '7 ปี', 'มีน', 2532, 'AB', '02-123-4567', 'สอน yoga, breathwork และ recovery class สำหรับสมดุลร่างกายหลังฝึกหนัก', JSON_ARRAY('Yoga','Recovery','Breathwork'), JSON_ARRAY(JSON_OBJECT('title','Drop-in','text','1 ครั้ง · 75 นาที','price',1000),JSON_OBJECT('title','5 Sessions','text','แพ็ก 5 ครั้ง','price',4500),JSON_OBJECT('title','Monthly','text','คลาสส่วนตัวรายเดือน','price',16000)), JSON_ARRAY(JSON_OBJECT('day','อังคาร','date','14','slots',JSON_ARRAY(JSON_OBJECT('time','08:00','status','available'),JSON_OBJECT('time','19:30','status','available'))),JSON_OBJECT('day','พฤหัสฯ','date','16','slots',JSON_ARRAY(JSON_OBJECT('time','09:30','status','available'),JSON_OBJECT('time','16:00','status','full'))),JSON_OBJECT('day','อาทิตย์','date','19','slots',JSON_ARRAY(JSON_OBJECT('time','11:00','status','available'),JSON_OBJECT('time','18:00','status','available')))), '@ppa_may', 1000, JSON_ARRAY('RYT-200 Yoga Alliance','Yin Yoga Certification'), 40),
  ('zack', 'Zack Lee', 'แซค', 'CrossFit Coach', '🧑‍🦲', '8 ปี', 'ธนู', 2533, 'O', '02-123-4567', 'โค้ช CrossFit และ metabolic conditioning สำหรับผู้ที่ต้องการเพิ่ม power, agility และ body composition', JSON_ARRAY('CrossFit','Metcon','Power'), JSON_ARRAY(JSON_OBJECT('title','รายวัน','text','1 ครั้ง · 1 ชม.','price',1400),JSON_OBJECT('title','รายสัปดาห์','text','5 ครั้ง/สัปดาห์','price',6300),JSON_OBJECT('title','รายเดือน','text','20 ครั้ง/เดือน','price',23400)), JSON_ARRAY(JSON_OBJECT('day','พุธ','date','15','slots',JSON_ARRAY(JSON_OBJECT('time','08:00','status','available'),JSON_OBJECT('time','18:00','status','available'))),JSON_OBJECT('day','ศุกร์','date','17','slots',JSON_ARRAY(JSON_OBJECT('time','14:00','status','available'),JSON_OBJECT('time','20:30','status','full'))),JSON_OBJECT('day','เสาร์','date','18','slots',JSON_ARRAY(JSON_OBJECT('time','09:30','status','available'),JSON_OBJECT('time','17:00','status','available')))), '@ppa_zack', 1400, JSON_ARRAY('CrossFit Level 2 Trainer','TRX Suspension Training'), 50)
ON DUPLICATE KEY UPDATE role = VALUES(role), start_price = VALUES(start_price), bio = VALUES(bio), specialties = VALUES(specialties), packages = VALUES(packages), weekly_schedule = VALUES(weekly_schedule), social_line = VALUES(social_line), sort_order = VALUES(sort_order);

INSERT INTO app_content_items (content_type, slug, title, subtitle, body, icon, action_label, target_screen, price, metadata, sort_order)
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
  ('membership_plan', 'monthly', 'แพ็กเกจ Monthly', 'เข้าใช้บริการตามสิทธิ์สมาชิก', 'เหมาะสำหรับสมาชิกที่ใช้บริการรายเดือน', '📦', 'ซื้อแพ็กเกจ', 'plans', 1900, JSON_OBJECT('duration','monthly'), 10),
  ('membership_plan', 'quarterly', 'แพ็กเกจ Quarterly', 'เข้าใช้บริการตามสิทธิ์สมาชิก', 'คุ้มกว่าสำหรับสมาชิกประจำ', '📦', 'ซื้อแพ็กเกจ', 'plans', 5100, JSON_OBJECT('duration','quarterly'), 20),
  ('membership_plan', 'annual', 'แพ็กเกจ Annual', 'เข้าใช้บริการตามสิทธิ์สมาชิก', 'สมาชิกทั้งปีพร้อมสิทธิพิเศษ', '💎', 'ซื้อแพ็กเกจ', 'plans', 18000, JSON_OBJECT('duration','annual'), 30),
  ('feature_screen', 'classhub', 'คลาสออกกำลังกาย', 'รวม Yoga, Pilates, HYROX, Airfit และบริการเสริม', 'เลือกคลาสและแพ็กเกจจากข้อมูลที่จัดการในหลังบ้าน', '🧘', 'ดูคลาส', 'classhub', 0, JSON_OBJECT('screens',JSON_ARRAY('svcclass','svcdetail','classes','classschedule')), 10),
  ('feature_screen', 'profile-tools', 'ข้อมูลสมาชิก', 'Personal, Visits, Buy History, Coupons, Status และ Notification Settings', 'หน้าสมาชิกเชื่อมกับข้อมูลจริงของผู้ใช้และรายการซื้อในระบบ', '👤', 'จัดการ', 'profile', 0, JSON_OBJECT('screens',JSON_ARRAY('personal','visits','buyhistory','mycoupons','mystatus','notisettings')), 20),
  ('feature_screen', 'groups-kuan', 'Find Your Game & Buffet Rank', 'Open Run, ก๊วน, Ranking, Vote และ Reward', 'ระบบก๊วนเชื่อมการสร้างกลุ่มจริง ส่วน ranking/vote/reward แสดงเป็น managed feature พร้อมต่อ backend เฉพาะได้', '👥', 'เปิด', 'groups', 0, JSON_OBJECT('screens',JSON_ARRAY('orprofile','kuanprofile','groupcreate','groupdetail','groupchat','groupranking','kuanvote','kuanresult','kuanredeem','playerprofile','coinshop','kuanroster','kuanpairs')), 30)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  subtitle = VALUES(subtitle),
  body = VALUES(body),
  icon = VALUES(icon),
  action_label = VALUES(action_label),
  target_screen = VALUES(target_screen),
  price = VALUES(price),
  metadata = VALUES(metadata),
  active = TRUE,
  sort_order = VALUES(sort_order);

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
JOIN admin_permissions p ON p.code IN ('dashboard.view','members.manage','staff.manage','reports.view','coupons.manage','bookings.manage','trainers.manage','content.manage')
WHERE r.code = 'manager';

INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin_roles r
JOIN admin_permissions p ON p.code IN ('dashboard.view','members.manage','bookings.manage','coupons.manage')
WHERE r.code = 'front_desk';

INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin_roles r
JOIN admin_permissions p ON p.code IN ('dashboard.view','reports.view','payments.manage')
WHERE r.code = 'finance';

INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin_roles r
JOIN admin_permissions p ON p.code IN ('dashboard.view','trainers.manage')
WHERE r.code = 'trainer';

INSERT INTO admin_staff (username, password_hash, display_name, email, phone, status, role_id)
SELECT 'zeroline',
  'scrypt:c246073c4f671011bd91222f7f9a9718:1d27a51caca268b201de5d033d83dc0e63fca5373d3dfc193170749eafa3a4e638843b15107949d419b5dfe411f0baf8bfb4ce77965f2cc3c1565d5023e60d99',
  'i''m zΞro',
  NULL,
  NULL,
  'active',
  r.id
FROM admin_roles r
WHERE r.code = 'super_admin'
ON DUPLICATE KEY UPDATE
  password_hash = VALUES(password_hash),
  display_name = VALUES(display_name),
  status = 'active',
  role_id = VALUES(role_id);
