


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "api";


ALTER SCHEMA "api" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."article_status" AS ENUM (
    'pending',
    'scraping',
    'ready',
    'stale',
    'failed',
    'skip_by_admin',
    'skip_by_failure'
);


ALTER TYPE "public"."article_status" OWNER TO "postgres";


CREATE TYPE "public"."content_medium" AS ENUM (
    'markdown',
    'pdf',
    'html',
    'unknown'
);


ALTER TYPE "public"."content_medium" OWNER TO "postgres";


CREATE TYPE "public"."curiosity_quiz_status" AS ENUM (
    'pending',
    'processing',
    'ready',
    'failed',
    'skip_by_admin',
    'skip_by_failure'
);


ALTER TYPE "public"."curiosity_quiz_status" OWNER TO "postgres";


CREATE TYPE "public"."scaffold_quiz_status" AS ENUM (
    'pending',
    'processing',
    'ready',
    'failed',
    'skip_by_admin',
    'skip_by_failure'
);


ALTER TYPE "public"."scaffold_quiz_status" OWNER TO "postgres";


CREATE TYPE "public"."session_status" AS ENUM (
    'bookmarked',
    'pending',
    'ready',
    'errored',
    'skip_by_admin',
    'skip_by_failure'
);


ALTER TYPE "public"."session_status" OWNER TO "postgres";


COMMENT ON TYPE "public"."session_status" IS 'Session lifecycle: bookmarked (waiting in queue) → pending (being generated) → ready (quiz available) → errored (failed)';



CREATE TYPE "public"."study_status" AS ENUM (
    'not_started',
    'curiosity_in_progress',
    'curiosity_completed',
    'scaffold_in_progress',
    'scaffold_completed',
    'archived'
);


ALTER TYPE "public"."study_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "api"."claim_article_for_scraping"("p_article_id" bigint) RETURNS TABLE("article_id" bigint, "normalized_url" "text", "original_url" "text", "claimed" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  claimed_article_id BIGINT;
  claimed_normalized_url TEXT;
  claimed_original_url TEXT;
BEGIN
  -- Atomically claim and lock the article for scraping
  -- Only claim if status is 'pending', 'stale', or 'failed'
  UPDATE public.articles a
  SET 
    status = 'scraping',
    updated_at = NOW()
  WHERE a.id = p_article_id
    AND a.status IN ('pending', 'stale', 'failed')
  RETURNING a.id, a.normalized_url, a.original_url
  INTO claimed_article_id, claimed_normalized_url, claimed_original_url;

  -- If article was claimed, return success
  IF claimed_article_id IS NOT NULL THEN
    RETURN QUERY SELECT claimed_article_id, claimed_normalized_url, claimed_original_url, TRUE;
  ELSE
    -- Article is already being scraped or in terminal state
    -- Return article info but with claimed = FALSE
    SELECT a.id, a.normalized_url, a.original_url
    INTO claimed_article_id, claimed_normalized_url, claimed_original_url
    FROM public.articles a
    WHERE a.id = p_article_id;
    
    RETURN QUERY SELECT claimed_article_id, claimed_normalized_url, claimed_original_url, FALSE;
  END IF;
END;
$$;


ALTER FUNCTION "api"."claim_article_for_scraping"("p_article_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "api"."claim_article_for_scraping"("p_article_id" bigint) IS 'Atomically claims an article for scraping by setting status to scraping. Returns claimed=true if successful, false if already being scraped.';



CREATE OR REPLACE FUNCTION "api"."claim_next_scaffold_quiz"() RETURNS TABLE("scaffold_quiz_id" bigint, "quiz_id" bigint, "article_id" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT * FROM public.claim_next_scaffold_quiz();
$$;


ALTER FUNCTION "api"."claim_next_scaffold_quiz"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "api"."claim_specific_curiosity_quiz"("p_curiosity_quiz_id" bigint) RETURNS TABLE("curiosity_quiz_id" bigint, "quiz_id" bigint, "article_id" bigint, "claimed" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT * FROM public.claim_specific_curiosity_quiz(p_curiosity_quiz_id);
$$;


ALTER FUNCTION "api"."claim_specific_curiosity_quiz"("p_curiosity_quiz_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_next_scaffold_quiz"() RETURNS TABLE("scaffold_quiz_id" bigint, "quiz_id" bigint, "article_id" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  claimed_id BIGINT;
  claimed_quiz_id BIGINT;
  claimed_article_id BIGINT;
BEGIN
  -- Atomically claim and lock the next pending scaffold quiz
  UPDATE public.scaffold_quizzes sq
  SET status = 'processing'
  WHERE sq.id = (
    SELECT sq2.id
    FROM public.scaffold_quizzes sq2
    WHERE sq2.status = 'pending'
    ORDER BY sq2.updated_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING sq.id, sq.quiz_id
  INTO claimed_id, claimed_quiz_id;

  -- If no job was claimed, return empty
  IF claimed_id IS NULL THEN
    RETURN;
  END IF;

  -- Get article_id from quiz
  SELECT q.article_id INTO claimed_article_id
  FROM public.quizzes q
  WHERE q.id = claimed_quiz_id;

  -- Return claimed job info
  RETURN QUERY SELECT claimed_id, claimed_quiz_id, claimed_article_id;
END;
$$;


ALTER FUNCTION "public"."claim_next_scaffold_quiz"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_specific_curiosity_quiz"("p_curiosity_quiz_id" bigint) RETURNS TABLE("curiosity_quiz_id" bigint, "quiz_id" bigint, "article_id" bigint, "claimed" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  claimed_id BIGINT;
  claimed_quiz_id BIGINT;
  claimed_article_id BIGINT;
BEGIN
  -- Atomically claim and lock the specific curiosity quiz if it's pending or failed
  UPDATE public.curiosity_quizzes cq
  SET status = 'processing'
  WHERE cq.id = p_curiosity_quiz_id
    AND cq.status IN ('pending', 'failed')
  RETURNING cq.id, cq.quiz_id
  INTO claimed_id, claimed_quiz_id;

  -- If no job was claimed, return the quiz info but with claimed=false
  IF claimed_id IS NULL THEN
    SELECT cq.id, cq.quiz_id
    INTO claimed_id, claimed_quiz_id
    FROM public.curiosity_quizzes cq
    WHERE cq.id = p_curiosity_quiz_id;

    IF claimed_id IS NULL THEN
      RETURN;
    END IF;

    SELECT q.article_id INTO claimed_article_id
    FROM public.quizzes q
    WHERE q.id = claimed_quiz_id;

    RETURN QUERY SELECT claimed_id, claimed_quiz_id, claimed_article_id, FALSE;
    RETURN;
  END IF;

  SELECT q.article_id INTO claimed_article_id
  FROM public.quizzes q
  WHERE q.id = claimed_quiz_id;

  RETURN QUERY SELECT claimed_id, claimed_quiz_id, claimed_article_id, TRUE;
END;
$$;


ALTER FUNCTION "public"."claim_specific_curiosity_quiz"("p_curiosity_quiz_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."articles" (
    "id" bigint NOT NULL,
    "normalized_url" "text" NOT NULL,
    "original_url" "text" NOT NULL,
    "status" "public"."article_status" DEFAULT 'pending'::"public"."article_status" NOT NULL,
    "storage_path" "text",
    "content_hash" "text",
    "last_scraped_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "storage_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "content_medium" "public"."content_medium" DEFAULT 'html'::"public"."content_medium",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."articles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "api"."articles" AS
 SELECT "id",
    "normalized_url",
    "original_url",
    "status",
    "storage_path",
    "content_hash",
    "last_scraped_at",
    "metadata",
    "storage_metadata",
    "content_medium",
    "created_at",
    "updated_at"
   FROM "public"."articles";


ALTER VIEW "api"."articles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."curiosity_quizzes" (
    "id" bigint NOT NULL,
    "quiz_id" bigint NOT NULL,
    "status" "public"."curiosity_quiz_status" DEFAULT 'pending'::"public"."curiosity_quiz_status" NOT NULL,
    "questions" "jsonb",
    "pedagogy" "jsonb",
    "model_version" "text",
    "error_message" "text",
    "retry_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."curiosity_quizzes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "api"."curiosity_quizzes" AS
 SELECT "id",
    "quiz_id",
    "status",
    "questions",
    "pedagogy",
    "model_version",
    "error_message",
    "retry_count",
    "created_at",
    "updated_at"
   FROM "public"."curiosity_quizzes";


ALTER VIEW "api"."curiosity_quizzes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quizzes" (
    "id" bigint NOT NULL,
    "article_id" bigint NOT NULL,
    "variant" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid"
);


ALTER TABLE "public"."quizzes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "api"."quizzes" AS
 SELECT "id",
    "article_id",
    "variant",
    "created_at",
    "updated_at",
    "user_id"
   FROM "public"."quizzes";


ALTER VIEW "api"."quizzes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scaffold_quizzes" (
    "id" bigint NOT NULL,
    "quiz_id" bigint NOT NULL,
    "status" "public"."scaffold_quiz_status" DEFAULT 'pending'::"public"."scaffold_quiz_status" NOT NULL,
    "questions" "jsonb",
    "reading_plan" "jsonb",
    "model_version" "text",
    "error_message" "text",
    "retry_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."scaffold_quizzes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "api"."scaffold_quizzes" AS
 SELECT "id",
    "quiz_id",
    "status",
    "questions",
    "reading_plan",
    "model_version",
    "error_message",
    "retry_count",
    "created_at",
    "updated_at"
   FROM "public"."scaffold_quizzes";


ALTER VIEW "api"."scaffold_quizzes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" bigint NOT NULL,
    "session_token" "text" NOT NULL,
    "user_email" "text" NOT NULL,
    "article_url" "text" NOT NULL,
    "quiz_id" bigint,
    "status" "public"."session_status" DEFAULT 'pending'::"public"."session_status" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "study_status" "public"."study_status" DEFAULT 'not_started'::"public"."study_status" NOT NULL
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."sessions"."study_status" IS 'Tracks user progress through quiz: not_started → curiosity_in_progress → curiosity_completed → archived';



CREATE OR REPLACE VIEW "api"."sessions" AS
 SELECT "id",
    "session_token",
    "user_email",
    "article_url",
    "quiz_id",
    "status",
    "metadata",
    "created_at",
    "updated_at",
    "user_id",
    "study_status"
   FROM "public"."sessions";


ALTER VIEW "api"."sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "auth_method" "text" DEFAULT 'guest'::"text" NOT NULL,
    "email" "text",
    "display_name" "text",
    "last_seen_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "users_auth_method_check" CHECK (("auth_method" = ANY (ARRAY['guest'::"text", 'email'::"text", 'oauth'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE OR REPLACE VIEW "api"."users" AS
 SELECT "id",
    "auth_method",
    "email",
    "display_name",
    "last_seen_at",
    "metadata",
    "created_at",
    "updated_at"
   FROM "public"."users";


ALTER VIEW "api"."users" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."articles_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."articles_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."articles_id_seq" OWNED BY "public"."articles"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."curiosity_quizzes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."curiosity_quizzes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."curiosity_quizzes_id_seq" OWNED BY "public"."curiosity_quizzes"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."quizzes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."quizzes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."quizzes_id_seq" OWNED BY "public"."quizzes"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."scaffold_quizzes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."scaffold_quizzes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."scaffold_quizzes_id_seq" OWNED BY "public"."scaffold_quizzes"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."sessions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."sessions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."sessions_id_seq" OWNED BY "public"."sessions"."id";



ALTER TABLE ONLY "public"."articles" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."articles_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."curiosity_quizzes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."curiosity_quizzes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."quizzes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."quizzes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."scaffold_quizzes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."scaffold_quizzes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."sessions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."sessions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_normalized_url_key" UNIQUE ("normalized_url");



ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curiosity_quizzes"
    ADD CONSTRAINT "curiosity_quizzes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curiosity_quizzes"
    ADD CONSTRAINT "curiosity_quizzes_quiz_id_key" UNIQUE ("quiz_id");



ALTER TABLE ONLY "public"."quizzes"
    ADD CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scaffold_quizzes"
    ADD CONSTRAINT "scaffold_quizzes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scaffold_quizzes"
    ADD CONSTRAINT "scaffold_quizzes_quiz_id_key" UNIQUE ("quiz_id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_session_token_key" UNIQUE ("session_token");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_user_id_article_url_key" UNIQUE ("user_id", "article_url");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_articles_normalized_url" ON "public"."articles" USING "btree" ("normalized_url");



CREATE INDEX "idx_articles_status" ON "public"."articles" USING "btree" ("status");



CREATE INDEX "idx_curiosity_quizzes_quiz_id" ON "public"."curiosity_quizzes" USING "btree" ("quiz_id");



CREATE INDEX "idx_curiosity_quizzes_status" ON "public"."curiosity_quizzes" USING "btree" ("status");



CREATE INDEX "idx_quizzes_article_id" ON "public"."quizzes" USING "btree" ("article_id");



CREATE INDEX "idx_scaffold_quizzes_quiz_id" ON "public"."scaffold_quizzes" USING "btree" ("quiz_id");



CREATE INDEX "idx_scaffold_quizzes_status" ON "public"."scaffold_quizzes" USING "btree" ("status");



CREATE INDEX "idx_sessions_bookmarked" ON "public"."sessions" USING "btree" ("user_id", "created_at") WHERE ("status" = 'bookmarked'::"public"."session_status");



CREATE INDEX "idx_sessions_email_url" ON "public"."sessions" USING "btree" ("user_email", "article_url");



CREATE INDEX "idx_sessions_quiz_id" ON "public"."sessions" USING "btree" ("quiz_id");



CREATE INDEX "idx_sessions_study_status" ON "public"."sessions" USING "btree" ("study_status");



CREATE INDEX "idx_sessions_token" ON "public"."sessions" USING "btree" ("session_token");



CREATE INDEX "idx_sessions_user_study" ON "public"."sessions" USING "btree" ("user_id", "study_status") WHERE ("study_status" = ANY (ARRAY['not_started'::"public"."study_status", 'curiosity_in_progress'::"public"."study_status"]));



CREATE UNIQUE INDEX "one_shared_quiz_per_article" ON "public"."quizzes" USING "btree" ("article_id") WHERE ("user_id" IS NULL);



CREATE OR REPLACE TRIGGER "update_articles_updated_at" BEFORE UPDATE ON "public"."articles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_curiosity_quizzes_updated_at" BEFORE UPDATE ON "public"."curiosity_quizzes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_quizzes_updated_at" BEFORE UPDATE ON "public"."quizzes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_scaffold_quizzes_updated_at" BEFORE UPDATE ON "public"."scaffold_quizzes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_sessions_updated_at" BEFORE UPDATE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."curiosity_quizzes"
    ADD CONSTRAINT "curiosity_quizzes_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quizzes"
    ADD CONSTRAINT "quizzes_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quizzes"
    ADD CONSTRAINT "quizzes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."scaffold_quizzes"
    ADD CONSTRAINT "scaffold_quizzes_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "api" TO "service_role";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "api"."claim_article_for_scraping"("p_article_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "api"."claim_next_scaffold_quiz"() TO "service_role";



GRANT ALL ON FUNCTION "api"."claim_specific_curiosity_quiz"("p_curiosity_quiz_id" bigint) TO "service_role";































































































































































GRANT ALL ON FUNCTION "public"."claim_next_scaffold_quiz"() TO "anon";
GRANT ALL ON FUNCTION "public"."claim_next_scaffold_quiz"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_next_scaffold_quiz"() TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_specific_curiosity_quiz"("p_curiosity_quiz_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_specific_curiosity_quiz"("p_curiosity_quiz_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_specific_curiosity_quiz"("p_curiosity_quiz_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";












GRANT ALL ON TABLE "public"."articles" TO "anon";
GRANT ALL ON TABLE "public"."articles" TO "authenticated";
GRANT ALL ON TABLE "public"."articles" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "api"."articles" TO "service_role";



GRANT ALL ON TABLE "public"."curiosity_quizzes" TO "anon";
GRANT ALL ON TABLE "public"."curiosity_quizzes" TO "authenticated";
GRANT ALL ON TABLE "public"."curiosity_quizzes" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "api"."curiosity_quizzes" TO "service_role";



GRANT ALL ON TABLE "public"."quizzes" TO "anon";
GRANT ALL ON TABLE "public"."quizzes" TO "authenticated";
GRANT ALL ON TABLE "public"."quizzes" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "api"."quizzes" TO "service_role";



GRANT ALL ON TABLE "public"."scaffold_quizzes" TO "anon";
GRANT ALL ON TABLE "public"."scaffold_quizzes" TO "authenticated";
GRANT ALL ON TABLE "public"."scaffold_quizzes" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "api"."scaffold_quizzes" TO "service_role";



GRANT ALL ON TABLE "public"."sessions" TO "anon";
GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "api"."sessions" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "api"."users" TO "service_role";









GRANT ALL ON SEQUENCE "public"."articles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."articles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."articles_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."curiosity_quizzes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."curiosity_quizzes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."curiosity_quizzes_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."quizzes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."quizzes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."quizzes_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."scaffold_quizzes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."scaffold_quizzes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."scaffold_quizzes_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sessions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sessions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sessions_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

