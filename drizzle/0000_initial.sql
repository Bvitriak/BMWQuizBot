CREATE TYPE "public"."quiz_round_mode" AS ENUM('quiz', 'topic', 'review');--> statement-breakpoint
CREATE TABLE "quiz_players" (
	"id" bigint PRIMARY KEY NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"incorrect" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"ranked" boolean DEFAULT false NOT NULL,
	"menu_nonce" text,
	"menu_chat_id" bigint,
	"menu_until" timestamp with time zone,
	CONSTRAINT "quiz_players_positive_id" CHECK ("quiz_players"."id" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "quiz_players_safe_counters" CHECK (
    "quiz_players"."correct" BETWEEN 0 AND 1000000000 AND "quiz_players"."incorrect" BETWEEN 0 AND 1000000000
    AND "quiz_players"."skipped" BETWEEN 0 AND 1000000000 AND "quiz_players"."completed" BETWEEN 0 AND 1000000000
  ),
	CONSTRAINT "quiz_players_menu_is_complete" CHECK (
    num_nonnulls("quiz_players"."menu_nonce", "quiz_players"."menu_chat_id", "quiz_players"."menu_until") IN (0, 3)
    AND ("quiz_players"."menu_nonce" IS NULL OR "quiz_players"."menu_nonce" ~ '^[A-Za-z0-9_-]{16}$')
    AND ("quiz_players"."menu_chat_id" IS NULL OR "quiz_players"."menu_chat_id" <> 0)
  )
);
--> statement-breakpoint
CREATE TABLE "quiz_rounds" (
	"player_id" bigint NOT NULL,
	"mode" "quiz_round_mode" NOT NULL,
	"nonce" text NOT NULL,
	"chat_id" bigint NOT NULL,
	"category" text,
	"question_order" text[] NOT NULL,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"buttons_until" timestamp with time zone NOT NULL,
	CONSTRAINT "quiz_rounds_player_id_mode_pk" PRIMARY KEY("player_id","mode"),
	CONSTRAINT "quiz_round_nonce_key" UNIQUE("nonce"),
	CONSTRAINT "quiz_round_auth_fields" CHECK ("quiz_rounds"."chat_id" <> 0 AND "quiz_rounds"."nonce" ~ '^[A-Za-z0-9_-]{16}$'),
	CONSTRAINT "quiz_round_scope" CHECK (
    ("quiz_rounds"."mode" = 'topic' AND "quiz_rounds"."category" IS NOT NULL AND cardinality("quiz_rounds"."question_order") BETWEEN 1 AND 5)
    OR ("quiz_rounds"."mode" <> 'topic' AND "quiz_rounds"."category" IS NULL AND cardinality("quiz_rounds"."question_order") BETWEEN 1 AND 100)
  ),
	CONSTRAINT "quiz_round_progress" CHECK (
    jsonb_typeof("quiz_rounds"."answers") = 'array' AND jsonb_array_length("quiz_rounds"."answers") <= cardinality("quiz_rounds"."question_order")
  )
);
--> statement-breakpoint
CREATE TABLE "quiz_unresolved" (
	"player_id" bigint NOT NULL,
	"question_id" text NOT NULL,
	CONSTRAINT "quiz_unresolved_player_id_question_id_pk" PRIMARY KEY("player_id","question_id"),
	CONSTRAINT "quiz_unresolved_valid_id" CHECK ("quiz_unresolved"."question_id" ~ '^[a-z0-9-]{1,32}$')
);
--> statement-breakpoint
ALTER TABLE "quiz_rounds" ADD CONSTRAINT "quiz_rounds_player_id_quiz_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."quiz_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_unresolved" ADD CONSTRAINT "quiz_unresolved_player_id_quiz_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."quiz_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_rank_correct_idx" ON "quiz_players" USING btree ("correct") WHERE "quiz_players"."ranked";