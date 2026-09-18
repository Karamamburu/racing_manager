-- ========================================
-- Racing Manager DB (MVP)
-- ========================================

-- Display and interpret timestamps in Moscow time (UTC+3, no DST).
DO $$
BEGIN
  EXECUTE format(
    'ALTER DATABASE %I SET timezone TO %L',
    current_database(),
    'Europe/Moscow'
  );
END
$$;
SET timezone = 'Europe/Moscow';

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- ENUMS (MVP only)
-- ========================================
CREATE TYPE sport_type AS ENUM ('RUN', 'SKI', 'ROLLER_SKI', 'BIKE');
CREATE TYPE event_type AS ENUM ('RACE', 'TIME_TRIAL');
CREATE TYPE event_status AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED');
CREATE TYPE registration_status AS ENUM ('REGISTERED', 'CONFIRMED', 'CANCELLED', 'WITHDRAWN', 'DNS', 'DNF', 'QQ', 'DSQ');
CREATE TYPE gender_type AS ENUM ('M', 'F');
CREATE TYPE personal_consent_document_type AS ENUM ('PRIVACY_POLICY', 'PERSONAL_DATA_CONSENT');
CREATE TYPE personal_consent_action AS ENUM ('GRANTED', 'REVOKED');
CREATE TYPE personal_consent_source AS ENUM ('PROFILE_UPDATE', 'REGISTRATION', 'REVOKE');

-- ========================================
-- USERS
-- ========================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  authentik_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  user_name TEXT UNIQUE NOT NULL,
  last_name TEXT,
  gender gender_type,
  birth_date DATE,
  city TEXT,
  district TEXT,
  team TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- ROLES
-- A user without user_roles rows is a regular participant.
-- Assign / revoke roles with SQL only (no admin UI yet).
-- The users row is created on first Authentik login — grant after that.
--
-- Grant:
--   INSERT INTO user_roles (user_id, role_id)
--   SELECT u.id, r.id
--   FROM users u
--   CROSS JOIN roles r
--   WHERE u.email = 'you@example.com'
--     AND r.code = 'ADMINISTRATOR'  -- or ORGANIZER
--   ON CONFLICT DO NOTHING;
--
-- Revoke:
--   DELETE FROM user_roles ur
--   USING users u, roles r
--   WHERE ur.user_id = u.id
--     AND ur.role_id = r.id
--     AND u.email = 'you@example.com'
--     AND r.code = 'ADMINISTRATOR';
-- ========================================
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- ========================================
-- TRACKS
-- ========================================
CREATE TABLE tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  location_city TEXT,
  description TEXT,
  map_link TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- EVENTS
-- ========================================
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  event_type event_type NOT NULL DEFAULT 'RACE',
  sport sport_type NOT NULL,
  event_date TIMESTAMPTZ NOT NULL,
  distance_km NUMERIC(6, 2) CHECK (distance_km > 0),
  description TEXT,
  map_link TEXT,
  registration_open TIMESTAMPTZ,
  registration_close TIMESTAMPTZ,
  status event_status NOT NULL DEFAULT 'PLANNED',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    registration_open IS NULL
    OR registration_close IS NULL
    OR registration_open <= registration_close
  )
);

-- ========================================
-- EVENT LAPS
-- Planned laps of an event. distance_km is the length of one lap.
-- events.distance_km is the sum of these rows.
-- ========================================
CREATE TABLE event_laps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  lap_number INT NOT NULL CHECK (lap_number > 0),
  distance_km NUMERIC(6, 2) NOT NULL CHECK (distance_km > 0),
  UNIQUE (event_id, lap_number)
);

-- ========================================
-- PARTICIPATION FORMATS
-- Catalog of start styles / equipment classes per sport.
-- RUN and BIKE have no rows: ranking is by gender only.
-- An event enables a subset; the rider picks one at registration.
-- Place is ranked per (format, gender), not overall.
-- Live while the event is open; written to results.place at DONE.
-- ========================================
CREATE TABLE participation_formats (
  id SERIAL PRIMARY KEY,
  sport sport_type NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (sport, code)
);

CREATE TABLE event_formats (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  format_id INT NOT NULL REFERENCES participation_formats(id),
  PRIMARY KEY (event_id, format_id)
);

-- ========================================
-- REGISTRATIONS
-- Guest registrations have user_id = NULL and store participant fields here.
-- Logged-in users are linked via user_id; participant fields are a snapshot
-- of the form submitted at registration time.
-- start_number is assigned later by a race administrator.
-- format_id is required when the event has participation formats.
-- ========================================
CREATE TABLE registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  gender gender_type NOT NULL,
  birth_year INT NOT NULL CHECK (birth_year >= 1900 AND birth_year <= 2100),
  city TEXT,
  district TEXT,
  team TEXT,
  format_id INT REFERENCES participation_formats(id),
  start_number INT CHECK (start_number > 0),
  status registration_status NOT NULL DEFAULT 'REGISTERED',
  note TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- RESULTS
-- One finish time per registration. time_milliseconds is the sum
-- of result_laps for events that have laps. Place is computed live
-- by sorting complete finish times ascending (fastest first) within
-- each (format_id, gender) classification while the event is open.
-- When the event becomes DONE, that place is written here and kept
-- until the next transition into DONE. A start number must be
-- assigned before a result can be recorded.
-- ========================================
CREATE TABLE results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID NOT NULL UNIQUE REFERENCES registrations(id) ON DELETE CASCADE,
  time_milliseconds INT NOT NULL CHECK (time_milliseconds > 0),
  place INT CHECK (place IS NULL OR place > 0),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- RESULT LAPS
-- Split time for one planned event lap of one result.
-- ========================================
CREATE TABLE result_laps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  result_id UUID NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  event_lap_id UUID NOT NULL REFERENCES event_laps(id) ON DELETE CASCADE,
  time_milliseconds INT NOT NULL CHECK (time_milliseconds > 0),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (result_id, event_lap_id)
);

-- ========================================
-- PERSONAL DATA CONSENT
-- Versioned legal texts and append-only grant/revoke events.
-- Events always point at a specific document version.
-- ========================================
CREATE TABLE personal_consent_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type personal_consent_document_type NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  UNIQUE (type, version)
);

CREATE TABLE personal_consent_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES personal_consent_documents(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action personal_consent_action NOT NULL,
  source personal_consent_source NOT NULL,
  user_first_name TEXT NOT NULL,
  user_last_name TEXT NOT NULL,
  user_birth_date DATE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip TEXT,
  user_agent TEXT
);

-- ========================================
-- NEWS
-- Track-scoped articles. body is sanitized HTML from the admin editor.
-- ========================================
CREATE TABLE news (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  cover_image_url TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- INDEXES
-- ========================================
CREATE INDEX idx_users_authentik_id ON users(authentik_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX idx_events_track_id ON events(track_id);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_sport ON events(sport);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_event_laps_event_id ON event_laps(event_id);
CREATE INDEX idx_result_laps_result_id ON result_laps(result_id);
CREATE INDEX idx_result_laps_event_lap_id ON result_laps(event_lap_id);
CREATE INDEX idx_participation_formats_sport ON participation_formats(sport);
CREATE INDEX idx_event_formats_format_id ON event_formats(format_id);
CREATE INDEX idx_registrations_event_id ON registrations(event_id);
CREATE INDEX idx_registrations_user_id ON registrations(user_id);
CREATE INDEX idx_registrations_status ON registrations(status);
CREATE INDEX idx_registrations_format_id ON registrations(format_id);
CREATE INDEX idx_personal_consent_events_user_id ON personal_consent_events(user_id);
CREATE INDEX idx_personal_consent_events_document_id ON personal_consent_events(document_id);
CREATE INDEX idx_news_track_id ON news(track_id);
CREATE INDEX idx_news_published_at ON news(published_at DESC);
CREATE UNIQUE INDEX idx_registrations_event_user_active
  ON registrations (event_id, user_id)
  WHERE user_id IS NOT NULL
    AND status IN ('REGISTERED', 'CONFIRMED', 'DNS', 'DNF', 'QQ', 'DSQ');
CREATE UNIQUE INDEX idx_registrations_event_person_active
  ON registrations (
    event_id,
    lower(btrim(first_name)),
    lower(btrim(last_name)),
    birth_year
  )
  WHERE user_id IS NULL
    AND status IN ('REGISTERED', 'CONFIRMED', 'DNS', 'DNF', 'QQ', 'DSQ');
CREATE UNIQUE INDEX idx_registrations_event_start_number
  ON registrations (event_id, start_number)
  WHERE start_number IS NOT NULL;

-- ========================================
-- SEED
-- ========================================
INSERT INTO roles (code, name) VALUES
  ('ADMINISTRATOR', 'Administrator'),
  ('ORGANIZER', 'Organizer');

INSERT INTO tracks (id, name, location_city, description, is_active)
VALUES (
  '3d8f1a62-7c4e-4b91-9e2a-0b6c8d4e1f20',
  'Алёшкино',
  'Москва',
  'Лыжная трасса Алёшкино. Контрольные тренировки и гонки сообщества.',
  true
);

INSERT INTO participation_formats (sport, code, name, sort_order) VALUES
  ('SKI', 'FREESTYLE', 'Свободный стиль', 1),
  ('SKI', 'CLASSIC', 'Классический стиль', 2),
  ('ROLLER_SKI', 'FAST_WHEELS', 'Быстрые колёса', 1),
  ('ROLLER_SKI', 'SLOW_WHEELS', 'Медленные колёса', 2),
  ('ROLLER_SKI', 'CLASSIC', 'Классика', 3),
  ('ROLLER_SKI', 'INLINE', 'Ролики (без палок)', 4);

INSERT INTO personal_consent_documents (
  id,
  type,
  version,
  title,
  text,
  published_at
) VALUES (
  '7f4e2c91-5a18-4d73-9b06-2e8c1f0a3d45',
  'PRIVACY_POLICY',
  '2026-09-15',
  'Политика конфиденциальности',
  $privacy$Политика конфиденциальности портала Racing Manager
Дата публикации: 15 сентября 2026 г. Версия: 2026-09-15

Политика конфиденциальности (далее – Политика) описывает, какие персональные данные обрабатывает Оператор портала Racing Manager, для каких целей, на каком основании, как долго они хранятся и какие права есть у субъекта персональных данных.

1. Термины и определения
Оператор – лицо, осуществляющее администрирование и обеспечение функционирования портала Racing Manager. Реквизиты Оператора будут указаны в настоящей Политике после их утверждения.
Посетитель – лицо, посетившее и использующее Портал, в том числе без регистрации и авторизации.
Пользователь – Посетитель, прошедший аутентификацию через Провайдера идентификации.
Портал (Сайт) – информационный ресурс Racing Manager в сети «Интернет», обеспечивающий учёт гоночных мероприятий, трасс, регистраций и результатов.
Персональные данные – любая информация, относящаяся к прямо или косвенно определённому или определяемому физическому лицу.
Провайдер идентификации – внешний сервис аутентификации, на который Пользователь перенаправляется для входа в Портал.

2. Общие положения
2.1. Политика применяется к обработке персональных данных при использовании Портала.
2.2. Оператор обрабатывает персональные данные с учётом требований законодательства Российской Федерации, в том числе Федерального закона от 27.07.2006 № 152-ФЗ «О персональных данных».
2.3. Политика дополняет Политику использования файлов cookie, размещённую на Портале по адресу /policy/cookies.
2.4. Оператор не контролирует и не несёт ответственность за сайты третьих лиц, на которые Посетитель может перейти по ссылкам на Портале, а также за обработку данных Провайдером идентификации.

3. Состав обрабатываемых данных
3.1. При входе через Провайдера идентификации Оператор получает сведения, необходимые для создания учётной записи и сессии: идентификатор субъекта (sub), имя пользователя, адрес электронной почты, отображаемое имя (если они переданы Провайдером).
3.2. Пользователь по своему согласию может указать и изменять в личном кабинете: имя, фамилию, пол, дату рождения, город, район, команду.
3.3. При регистрации на мероприятие Оператор обрабатывает снимок данных участника в заявке: имя, фамилия, пол, год рождения, город, район, команда, выбранный формат участия, стартовый номер, статус заявки, а также результаты (время, круги), если они внесены.
3.4. При обращении к Порталу автоматически могут обрабатываться технические сведения: IP-адрес, сведения о браузере и устройстве, адрес страницы, дата и время обращения, реферер, данные сессии и строго необходимые cookies (connect.sid, cc_cookie, cc_choice). Аналитические и рекламные счётчики на дату публикации Политики не подключены. Подробности – в Политике использования файлов cookie.

4. Цели обработки
4.1. Создание и ведение учётной записи, аутентификация, работа личного кабинета.
4.2. Регистрация на мероприятия, формирование стартовых и итоговых протоколов, отображение результатов.
4.3. Связь с Пользователем по вопросам участия в мероприятиях, если Пользователь указал контактные данные.
4.4. Обеспечение работоспособности, безопасности Портала и учёт согласий.

5. Правовые основания
5.1. Обработка идентификатора, имени пользователя и адреса электронной почты, полученных от Провайдера идентификации, необходима для предоставления сервиса входа и ведения учётной записи.
5.2. Имя, фамилия, пол, дата рождения, город, район и команда, указанные или изменённые Пользователем в профиле, обрабатываются на основании согласия на обработку персональных данных (/policy/personal-data), которое Пользователь даёт при сохранении профиля.
5.3. Данные заявок и результатов обрабатываются для исполнения запрошенной Пользователем услуги участия в мероприятии и ведения протоколов.
5.4. Технические данные сессии и строго необходимые cookies обрабатываются для функционирования Портала.

6. Передача третьим лицам
6.1. Для входа используется Провайдер идентификации. Он обрабатывает данные в соответствии со своими правилами.
6.2. Оператор не продаёт персональные данные и не передаёт их третьим лицам для рекламы.
6.3. Передача возможна по требованию уполномоченных государственных органов в случаях, предусмотренных законом.

7. Срок хранения
7.1. Данные учётной записи хранятся, пока существует учётная запись Пользователя.
7.2. Данные заявок и результатов хранятся в составе архива мероприятий.
7.3. Записи о согласии на обработку персональных данных хранятся для подтверждения факта согласия.

8. Права субъекта
8.1. Пользователь вправе получать сведения об обработке своих данных, уточнять их в личном кабинете, требовать ограничение обработки или удаление в случаях, предусмотренных законом.
8.2. Согласие на обработку данных профиля, данное при сохранении, может быть отозвано. Отзыв не влияет на законность обработки до момента отзыва и может ограничить работу личного кабинета и регистрацию на мероприятия.
8.3. Для реализации прав Пользователь может направить запрос Оператору. Контактные данные Оператора будут указаны в настоящей Политике после их утверждения. Срок ответа составляет 10 (десять) рабочих дней.

9. Изменение Политики
9.1. Оператор вправе изменять Политику. Новая редакция вступает в силу с даты размещения на Портале, если иное не предусмотрено новой редакцией.
9.2. Действующая Политика размещена на Портале по адресу /policy/privacy. Версия: 2026-09-15.$privacy$,
  TIMESTAMPTZ '2026-09-15 00:00:00+03'
);

INSERT INTO personal_consent_documents (
  id,
  type,
  version,
  title,
  text,
  published_at
) VALUES (
  '8a5f3d02-6b29-4e84-ac17-3f9d2e1b4c56',
  'PERSONAL_DATA_CONSENT',
  '2026-09-15',
  'Согласие на обработку персональных данных',
  $consent$Согласие на обработку персональных данных портала Racing Manager
Дата публикации: 15 сентября 2026 г. Версия: 2026-09-15

Настоящее согласие на обработку персональных данных (далее – Согласие) даётся субъектом персональных данных Оператору портала Racing Manager при сохранении или дополнении сведений о себе в личном кабинете либо при сохранении таких сведений в профиле после регистрации на мероприятие.

1. Кто даёт Согласие и кому
1.1. Согласие даёт Пользователь портала Racing Manager – физическое лицо, прошедшее аутентификацию через Провайдера идентификации и сохраняющее сведения о себе на Портале.
1.2. Согласие даётся Оператору – лицу, осуществляющему администрирование и обеспечение функционирования портала Racing Manager. Реквизиты Оператора указываются в Политике конфиденциальности после их утверждения.

2. Какие данные охватывает Согласие
2.1. Пользователь даёт согласие на обработку следующих персональных данных, которые он указывает, изменяет или дополняет в профиле: имя, фамилия, пол, дата рождения, город, район, команда.
2.2. Идентификатор субъекта, имя пользователя и адрес электронной почты, полученные от Провайдера идентификации при входе, обрабатываются для предоставления сервиса учётной записи и не требуют отдельного согласия по настоящему документу. Подробности – в Политике конфиденциальности.

3. Цели и действия с данными
3.1. Данные, указанные в пункте 2.1, обрабатываются в целях ведения профиля Пользователя в личном кабинете, регистрации на мероприятия и заполнения заявок без повторного ввода сведений, формирования стартовых и итоговых протоколов, отображения результатов.
3.2. Пользователь соглашается на совершение Оператором действий, предусмотренных п. 3 ч. 1 ст. 3 Федерального закона от 27.07.2006 № 152-ФЗ «О персональных данных», в том числе сбор, запись, систематизацию, накопление, хранение, уточнение (обновление, изменение), извлечение, использование, передачу (в случаях, указанных в Политике конфиденциальности), блокирование, удаление и уничтожение.
3.3. Обработка осуществляется с использованием средств автоматизации и без их использования.

4. Срок действия и отзыв
4.1. Согласие действует с момента его предоставления до отзыва либо до удаления учётной записи Пользователя.
4.2. Пользователь вправе отозвать Согласие. Отзыв не влияет на законность обработки, осуществлённой до момента отзыва, и может ограничить работу личного кабинета и регистрацию на мероприятия.
4.3. Каждое предоставление и каждый отзыв Согласия фиксируются Оператором отдельной записью с указанием версии настоящего документа.

5. Дополнительные условия
5.1. Порядок обработки персональных данных, права субъекта, срок хранения и сведения о передаче третьим лицам изложены в Политике конфиденциальности. Использование файлов cookie – в Политике использования файлов cookie.
5.2. Нажимая отметку о согласии и сохраняя профиль, Пользователь подтверждает, что ознакомился с текстом Согласия, действует добровольно и в своём интересе.
5.3. Действующая редакция Согласия размещена на Портале по адресу /policy/personal-data. Версия: 2026-09-15.$consent$,
  TIMESTAMPTZ '2026-09-15 00:00:00+03'
);
