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
CREATE TYPE registration_status AS ENUM ('REGISTERED', 'CONFIRMED', 'CANCELLED', 'WITHDRAWN', 'DNS', 'DNF', 'QQ', 'NQ', 'DSQ', 'FINISHED');
CREATE TYPE gender_type AS ENUM ('M', 'F');
CREATE TYPE class_competition_status AS ENUM ('DRAFT', 'IN_PROGRESS', 'DONE');
CREATE TYPE class_heat_result_status AS ENUM ('OK', 'DNS', 'DNF', 'DSQ');
CREATE TYPE personal_consent_document_type AS ENUM ('PRIVACY_POLICY', 'PERSONAL_DATA_CONSENT', 'PERSONAL_DATA_DISTRIBUTION_CONSENT');
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
-- CLASS COMPETITIONS
-- One multi-stage CMS competition per event classification (format x gender).
-- Heat times stay here; CMS stores places and the bracket.
-- ========================================
CREATE TABLE class_competitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  format_id INT REFERENCES participation_formats(id),
  gender gender_type NOT NULL,
  cms_competition_id UUID NOT NULL UNIQUE,
  status class_competition_status NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX class_competitions_event_class
  ON class_competitions (event_id, gender, COALESCE(format_id, -1));

-- A classification (format x gender) whose protocol was closed without a bracket.
CREATE TABLE category_finishes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  format_id INT REFERENCES participation_formats(id),
  gender gender_type NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX category_finishes_event_class
  ON category_finishes (event_id, gender, COALESCE(format_id, -1));

CREATE TABLE class_heat_times (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_competition_id UUID NOT NULL REFERENCES class_competitions(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL,
  heat_number INT NOT NULL CHECK (heat_number > 0),
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  time_milliseconds INT CHECK (time_milliseconds IS NULL OR time_milliseconds > 0),
  status class_heat_result_status NOT NULL DEFAULT 'OK',
  qualification_status registration_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_competition_id, stage_id, heat_number, registration_id)
);

-- Split time for one planned event lap inside a heat.
CREATE TABLE class_heat_lap_times (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_heat_time_id UUID NOT NULL REFERENCES class_heat_times(id) ON DELETE CASCADE,
  event_lap_id UUID NOT NULL REFERENCES event_laps(id) ON DELETE CASCADE,
  time_milliseconds INT NOT NULL CHECK (time_milliseconds > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_heat_time_id, event_lap_id)
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
  email TEXT,
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
CREATE INDEX idx_class_competitions_event_id ON class_competitions(event_id);
CREATE INDEX idx_category_finishes_event_id ON category_finishes(event_id);
CREATE INDEX idx_class_heat_times_stage ON class_heat_times(class_competition_id, stage_id);
CREATE INDEX idx_class_heat_times_registration_id ON class_heat_times(registration_id);
CREATE INDEX idx_class_heat_lap_times_heat_time_id ON class_heat_lap_times(class_heat_time_id);
CREATE INDEX idx_class_heat_lap_times_event_lap_id ON class_heat_lap_times(event_lap_id);
CREATE INDEX idx_personal_consent_events_user_id ON personal_consent_events(user_id);
CREATE INDEX idx_personal_consent_events_document_id ON personal_consent_events(document_id);
CREATE INDEX idx_news_track_id ON news(track_id);
CREATE INDEX idx_news_published_at ON news(published_at DESC);
CREATE UNIQUE INDEX idx_registrations_event_user_active
  ON registrations (event_id, user_id)
  WHERE user_id IS NOT NULL
    AND status IN ('REGISTERED', 'CONFIRMED', 'DNS', 'DNF', 'QQ', 'NQ', 'DSQ', 'FINISHED');
CREATE UNIQUE INDEX idx_registrations_event_person_active
  ON registrations (
    event_id,
    lower(btrim(first_name)),
    lower(btrim(last_name)),
    birth_year
  )
  WHERE user_id IS NULL
    AND status IN ('REGISTERED', 'CONFIRMED', 'DNS', 'DNF', 'QQ', 'NQ', 'DSQ', 'FINISHED');
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

INSERT INTO personal_consent_documents (
  id,
  type,
  version,
  title,
  text,
  published_at
) VALUES (
  '4c1d8e73-2f6a-4b05-8d39-6a0e5b7f2c18',
  'PRIVACY_POLICY',
  '2026-10-09',
  'Политика в отношении обработки персональных данных',
  $privacy$Политика в отношении обработки персональных данных портала «Все на гонку»
Дата публикации: 9 октября 2026 г. Версия: 2026-10-09

1. Общие положения
1.1. Настоящая Политика в отношении обработки персональных данных (далее – Политика) составлена в соответствии с требованиями Федерального закона от 27.07.2006 № 152-ФЗ «О персональных данных» (далее – Закон о персональных данных) и определяет порядок обработки персональных данных и меры по обеспечению их безопасности, предпринимаемые Оператором портала «Все на гонку».
1.2. Оператор ставит своей важнейшей целью и условием осуществления своей деятельности соблюдение прав и свобод человека и гражданина при обработке его персональных данных, в том числе защиты прав на неприкосновенность частной жизни, личную и семейную тайну.
1.3. Политика применяется ко всем персональным данным, которые Оператор получает о Посетителях, Пользователях и Участниках при использовании Портала, а также при регистрации Участников на мероприятия Организаторами.
1.4. Политика опубликована в свободном доступе в сети «Интернет» на Портале во исполнение ч. 2 ст. 18.1 Закона о персональных данных. Использование файлов cookie дополнительно регулируется Политикой использования файлов cookie (/policy/cookies).

2. Основные понятия
Оператор – физическое лицо, указанное в разделе 3 Политики, самостоятельно организующее и осуществляющее обработку персональных данных, определяющее цели обработки, состав персональных данных и действия (операции), совершаемые с ними.
Портал – портал «Все на гонку» – совокупность графических и информационных материалов, программ для ЭВМ и баз данных, обеспечивающих учёт гоночных мероприятий, трасс, регистраций и результатов и доступных в сети «Интернет» по адресу [https://адрес-портала].
Посетитель – любое лицо, посещающее Портал, в том числе без авторизации.
Пользователь – Посетитель, создавший учётную запись на Портале и выполнивший вход в неё.
Участник – физическое лицо, зарегистрированное на мероприятие самостоятельно через личный кабинет либо Организатором.
Организатор – Пользователь, которому Оператор предоставил права администратора или организатора мероприятий и который действует от имени Оператора.
Сервис входа – сервис аутентификации Authentik, развёрнутый Оператором на собственных серверах и используемый для регистрации учётной записи и входа на Портал.
Персональные данные – любая информация, относящаяся прямо или косвенно к определённому или определяемому физическому лицу (субъекту персональных данных).
Обработка персональных данных – любое действие (операция) или совокупность действий (операций) с персональными данными, совершаемых с использованием средств автоматизации или без их использования, включая сбор, запись, систематизацию, накопление, хранение, уточнение (обновление, изменение), извлечение, использование, передачу (распространение, предоставление, доступ), обезличивание, блокирование, удаление, уничтожение.
Автоматизированная обработка – обработка персональных данных с помощью средств вычислительной техники.
Предоставление персональных данных – действия, направленные на раскрытие персональных данных определённому лицу или определённому кругу лиц.
Распространение персональных данных – действия, направленные на раскрытие персональных данных неопределённому кругу лиц, в том числе их размещение в общедоступных протоколах мероприятий на Портале.
Блокирование персональных данных – временное прекращение обработки персональных данных (за исключением случаев, если обработка необходима для уточнения персональных данных).
Обезличивание персональных данных – действия, в результате которых становится невозможным без использования дополнительной информации определить принадлежность персональных данных конкретному субъекту.
Уничтожение персональных данных – действия, в результате которых становится невозможным восстановить содержание персональных данных в информационной системе и (или) уничтожаются материальные носители персональных данных.
Трансграничная передача персональных данных – передача персональных данных на территорию иностранного государства органу власти иностранного государства, иностранному физическому или юридическому лицу.

3. Сведения об Операторе
Оператор: [Фамилия Имя Отчество Оператора]; ИНН: [ИНН Оператора]; почтовый адрес для обращений: [Почтовый адрес для обращений]; адрес электронной почты для обращений по вопросам персональных данных: [адрес электронной почты для обращений].

4. Категории субъектов персональных данных
Посетители Портала; Пользователи, в том числе Организаторы; Участники мероприятий, в том числе не имеющие учётной записи на Портале.
Оператор не обрабатывает специальные категории персональных данных (сведения о расовой, национальной принадлежности, политических взглядах, религиозных или философских убеждениях, состоянии здоровья, интимной жизни), биометрические персональные данные и сведения о судимости.

5. Цели обработки, состав данных, правовые основания и сроки
Обработка ограничивается достижением конкретных, заранее определённых целей. Для каждой цели ниже указаны обрабатываемые данные, правовое основание и срок обработки.
5.1. Создание учётной записи и вход на Портал. Данные: идентификатор учётной записи, имя пользователя (логин), адрес электронной почты, отображаемое имя, хеш пароля (хранится только в Сервисе входа), дата и время входа. Субъекты: Пользователи. Основание: заключение и исполнение по инициативе Пользователя соглашения о предоставлении сервиса личного кабинета (п. 5 ч. 1 ст. 6 Закона о персональных данных). Срок: до удаления учётной записи; после удаления – уничтожение в течение 30 (тридцати) дней.
5.2. Ведение профиля в личном кабинете. Данные: имя, фамилия, пол, дата рождения, город, район, команда. Субъекты: Пользователи. Основание: согласие Пользователя (п. 1 ч. 1 ст. 6 Закона о персональных данных), которое он даёт отдельно при сохранении профиля на условиях Согласия на обработку персональных данных (/policy/personal-data). Срок: до отзыва согласия или удаления учётной записи; после этого – уничтожение в течение 30 (тридцати) дней, если отсутствует иное основание обработки.
5.3. Регистрация на мероприятия и ведение протоколов. Данные: имя, фамилия, пол, год рождения, город, район, команда, формат участия, стартовый номер, статус заявки, результаты (время прохождения кругов, итоговое время, место). Субъекты: Участники. Если Участника регистрирует Организатор, сведения вносятся со слов Участника и по его просьбе для участия в мероприятии. Основание: участие в мероприятии по инициативе Участника (п. 5 ч. 1 ст. 6 Закона о персональных данных). Срок: в течение 3 (трёх) лет после проведения мероприятия для рассмотрения протестов и подтверждения результатов; далее данные обезличиваются либо уничтожаются.
5.4. Публикация стартовых и итоговых протоколов на Портале. Данные: имя, фамилия, пол, год рождения, город, район, команда, формат участия, стартовый номер, статус и результаты. Субъекты: Участники. Основание: отдельное согласие Участника на обработку персональных данных, разрешённых для распространения (ст. 10.1 Закона о персональных данных), на условиях Согласия на распространение персональных данных (/policy/data-distribution). Срок: до отзыва согласия на распространение. Данные Участника, не давшего такое согласие или отозвавшего его, в общедоступных протоколах не публикуются.
5.5. Связь с Пользователем. Данные: адрес электронной почты, имя. Субъекты: Пользователи. Цель: направление сообщений об учётной записи и мероприятиях, на которые Пользователь зарегистрирован, ответы на обращения. Основание: п. 5 ч. 1 ст. 6 Закона о персональных данных. Срок: до удаления учётной записи. Оператор не направляет рекламные и маркетинговые рассылки. Если такие рассылки появятся, они будут возможны только после отдельного согласия.
5.6. Подтверждение факта согласия. Данные: идентификатор Пользователя, имя, фамилия, дата рождения, версия документа согласия, действие (предоставление или отзыв), дата и время, IP-адрес, сведения о браузере (User-Agent). Субъекты: Пользователи. Основание: исполнение обязанности Оператора доказать получение согласия (ч. 3 ст. 9 и п. 2 ч. 1 ст. 6 Закона о персональных данных). Срок: 3 (три) года с момента отзыва согласия или удаления учётной записи, после чего данные уничтожаются.
5.7. Обеспечение работоспособности и безопасности Портала. Данные: IP-адрес, сведения о браузере и устройстве, адрес запрашиваемой страницы, дата и время обращения, реферер, идентификатор сессии и идентификатор Пользователя в технических журналах, строго необходимые cookies. Субъекты: Посетители и Пользователи. Основание: осуществление законных интересов Оператора по защите Портала от несанкционированного доступа и сбоев при условии, что не нарушаются права субъектов (п. 7 ч. 1 ст. 6 Закона о персональных данных). Срок: технические журналы хранятся не более 30 (тридцати) дней. Аналитические и рекламные счётчики (в том числе «Яндекс.Метрика» и Google Analytics) на дату публикации Политики не подключены. Порядок использования cookies описан в Политике использования файлов cookie (/policy/cookies).

6. Порядок и условия обработки
6.1. Оператор осуществляет смешанную обработку персональных данных (с использованием средств автоматизации и без них) и совершает действия, перечисленные в разделе 2 Политики в определении обработки, в объёме, необходимом для целей раздела 5.
6.2. Запись, систематизация, накопление, хранение, уточнение и извлечение персональных данных граждан Российской Федерации осуществляются с использованием баз данных, находящихся на территории Российской Федерации (ч. 5 ст. 18 Закона о персональных данных). Серверы Портала, Сервиса входа, базы данных, резервные копии и технические журналы размещены в Российской Федерации.
6.3. Оператор не осуществляет трансграничную передачу персональных данных. Если необходимость в ней возникнет, Оператор до начала передачи уведомит уполномоченный орган по защите прав субъектов персональных данных в порядке ст. 12 Закона о персональных данных и внесёт изменения в Политику.
6.4. Оператор не принимает решений, порождающих юридические последствия для субъекта или иным образом затрагивающих его права и законные интересы, на основании исключительно автоматизированной обработки персональных данных.
6.5. Оператор не продаёт персональные данные и не передаёт их третьим лицам для рекламы. Персональные данные могут быть: доступны Организаторам в объёме, необходимом для проведения мероприятий и ведения протоколов; размещены на серверах хостинг-провайдеров, расположенных в Российской Федерации, по договору с Оператором; провайдеры не получают доступ к содержимому данных для собственных целей; предоставлены уполномоченным государственным органам в случаях, предусмотренных законодательством Российской Федерации; распространены в общедоступных протоколах только при наличии согласия, указанного в п. 5.4 Политики.
6.6. Если Оператор поручит обработку персональных данных другому лицу, такое поручение будет оформлено договором, содержащим требования ч. 3 ст. 6 Закона о персональных данных, включая обязанность соблюдать конфиденциальность и обеспечивать безопасность данных.
6.7. Резервные копии базы данных хранятся не более 14 (четырнадцати) дней. Данные, уничтоженные в основной базе, удаляются из резервных копий по истечении этого срока.

7. Меры по обеспечению безопасности
7.1. Безопасность персональных данных обеспечивается правовыми, организационными и техническими мерами в соответствии со ст. 18.1 и 19 Закона о персональных данных, в том числе: Оператор лично отвечает за организацию обработки персональных данных; доступ к персональным данным предоставляется только Организаторам и в объёме их ролей; Организаторы обязуются соблюдать конфиденциальность; передача данных между браузером и Порталом защищена протоколом HTTPS (TLS); сессионный cookie недоступен сценариям страницы (httpOnly), пароли хранятся только в виде хеша в Сервисе входа; база данных размещена в закрытой сети и недоступна из сети «Интернет», доступ к серверам ограничен межсетевым экраном и ключами SSH; выполняется регулярное резервное копирование и проверка восстановления данных; ведётся учёт действий с данными заявок и согласий, осуществляется контроль за принимаемыми мерами; проводится оценка вреда, который может быть причинён субъектам в случае нарушения Закона о персональных данных.
7.2. В случае выявления неправомерной или случайной передачи (предоставления, распространения, доступа) персональных данных, повлёкшей нарушение прав субъектов, Оператор уведомляет уполномоченный орган по защите прав субъектов персональных данных в течение 24 (двадцати четырёх) часов с момента выявления инцидента и о результатах внутреннего расследования – в течение 72 (семидесяти двух) часов (ч. 3.1 ст. 21 Закона о персональных данных).

8. Права субъектов персональных данных
8.1. Субъект персональных данных вправе: получить сведения об обработке своих персональных данных, указанные в ч. 7 ст. 14 Закона о персональных данных, в том числе о целях, способах, сроках обработки и лицах, имеющих к ним доступ; требовать уточнения своих персональных данных, их блокирования или уничтожения, если они являются неполными, устаревшими, неточными, незаконно полученными или не являются необходимыми для заявленной цели обработки; отозвать согласие на обработку персональных данных и согласие на их распространение; обжаловать действия или бездействие Оператора в уполномоченный орган по защите прав субъектов персональных данных (Роскомнадзор) или в судебном порядке.
8.2. Для реализации прав субъект направляет запрос на адрес электронной почты [адрес электронной почты для обращений] или по почтовому адресу, указанному в разделе 3. Запрос должен содержать фамилию и имя субъекта, сведения, подтверждающие его участие в отношениях с Оператором (например, адрес электронной почты учётной записи или название мероприятия), и подпись субъекта или его представителя. Запрос в электронной форме направляется с адреса электронной почты, указанного в учётной записи, либо подписывается электронной подписью.
8.3. Оператор отвечает на запрос в течение 10 (десяти) рабочих дней с момента его получения. Срок может быть продлён не более чем на 5 (пять) рабочих дней с направлением субъекту мотивированного уведомления о причинах продления.

9. Уточнение, блокирование, уничтожение данных и отзыв согласия
9.1. Пользователь может самостоятельно уточнить данные профиля в личном кабинете. Также можно направить Оператору письмо с темой «Актуализация персональных данных».
9.2. При подтверждении неточности персональных данных Оператор уточняет их в течение 7 (семи) рабочих дней. При выявлении неправомерной обработки Оператор прекращает её в течение 3 (трёх) рабочих дней, а если обеспечить правомерность невозможно – уничтожает данные в течение 10 (десяти) рабочих дней и уведомляет об этом субъекта.
9.3. Согласие на обработку данных профиля отзывается в личном кабинете или письмом Оператору с темой «Отзыв согласия на обработку персональных данных». После отзыва Оператор прекращает обработку и уничтожает данные в течение 30 (тридцати) дней, если иное основание обработки не предусмотрено законом. Отзыв не влияет на законность обработки до момента отзыва и может ограничить работу личного кабинета.
9.4. Согласие на распространение отзывается письмом Оператору с темой «Отзыв согласия на распространение персональных данных». Оператор прекращает публикацию данных в протоколах в течение 3 (трёх) рабочих дней с момента получения требования (ст. 10.1 Закона о персональных данных).
9.5. По достижении целей обработки или истечении сроков, указанных в разделе 5, данные уничтожаются или обезличиваются в течение 30 (тридцати) дней. Уничтожение подтверждается актом и выгрузкой из журнала событий в соответствии с требованиями уполномоченного органа.

10. Заключительные положения
10.1. Разъяснения по вопросам обработки персональных данных можно получить, обратившись к Оператору по адресу электронной почты [адрес электронной почты для обращений].
10.2. Оператор вправе изменять Политику. Новая редакция вступает в силу с даты её размещения на Портале, если иное не предусмотрено новой редакцией. Политика действует до замены её новой редакцией.
10.3. Действующая Политика размещена на Портале по адресу /policy/privacy. Версия: 2026-10-09.$privacy$,
  TIMESTAMPTZ '2026-10-09 00:00:00+03'
);

INSERT INTO personal_consent_documents (
  id,
  type,
  version,
  title,
  text,
  published_at
) VALUES (
  'b2e7a4d9-8c13-4f6e-a051-9d3c7e2b6f84',
  'PERSONAL_DATA_DISTRIBUTION_CONSENT',
  '2026-10-09',
  'Согласие на распространение персональных данных',
  $distribution$Согласие на обработку персональных данных, разрешённых для распространения, портала «Все на гонку»
Дата публикации: 9 октября 2026 г. Версия: 2026-10-09

Настоящее согласие на обработку персональных данных, разрешённых субъектом персональных данных для распространения (далее – Согласие), даётся в соответствии со ст. 10.1 Федерального закона от 27.07.2006 № 152-ФЗ «О персональных данных» (далее – Закон о персональных данных). Согласие оформляется отдельно от иных согласий на обработку персональных данных.

1. Субъект персональных данных
1.1. Согласие даёт Участник мероприятия, проводимого с использованием портала «Все на гонку» (далее – Портал). Фамилия, имя и контактные данные Участника (адрес электронной почты учётной записи) фиксируются Оператором при предоставлении Согласия вместе с версией настоящего документа, датой и временем.

2. Оператор
Оператор: [Фамилия Имя Отчество Оператора]; ИНН: [ИНН Оператора]; почтовый адрес: [Почтовый адрес для обращений]; адрес электронной почты: [адрес электронной почты для обращений].

3. Информационный ресурс и цель распространения
3.1. Персональные данные распространяются на Портале по адресу [https://адрес-портала] в разделах мероприятий: стартовые листы, списки зарегистрированных участников, итоговые протоколы и результаты.
3.2. Цель распространения – информирование участников, зрителей и иных заинтересованных лиц о составе участников и результатах спортивных мероприятий.

4. Перечень персональных данных
4.1. Участник даёт согласие на распространение следующих персональных данных (категория – общие персональные данные): фамилия; имя; пол; год рождения; город; район; команда; формат участия, стартовый номер, статус участия; результаты: время прохождения кругов, итоговое время, место.
4.2. Специальные категории и биометрические персональные данные не распространяются.
4.3. Участник вправе при предоставлении Согласия исключить из перечня отдельные сведения. Молчание или бездействие Участника не считается согласием на распространение. Если Участник не дал Согласие, его данные в общедоступных протоколах не публикуются.

5. Условия и запреты
5.1. Оператор не передаёт распространяемые данные третьим лицам иначе как путём их размещения на Портале и не использует их в целях, не указанных в разделе 3.
5.2. Участник вправе установить дополнительные запреты на передачу (кроме предоставления доступа) и условия обработки распространяемых данных, направив их Оператору на адрес электронной почты, указанный в разделе 2. Оператор публикует такие запреты и условия в течение 3 (трёх) рабочих дней.

6. Срок действия и отзыв
6.1. Согласие действует с момента его предоставления до отзыва Участником.
6.2. Участник вправе в любой момент потребовать прекратить распространение своих персональных данных, направив Оператору требование с темой «Отзыв согласия на распространение персональных данных». Требование должно содержать фамилию, имя и контактные данные Участника, а также перечень данных, распространение которых нужно прекратить. Оператор прекращает распространение в течение 3 (трёх) рабочих дней с момента получения требования.
6.3. Каждое предоставление и каждый отзыв Согласия фиксируются Оператором отдельной записью с указанием версии настоящего документа.

7. Дополнительные условия
7.1. Иные условия обработки персональных данных изложены в Политике в отношении обработки персональных данных (/policy/privacy).
7.2. Действующая редакция Согласия размещена на Портале по адресу /policy/data-distribution. Версия: 2026-10-09.$distribution$,
  TIMESTAMPTZ '2026-10-09 00:00:00+03'
);
