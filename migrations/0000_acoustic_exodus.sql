CREATE TABLE "hero_stories" (
	"story_id" text PRIMARY KEY NOT NULL,
	"hero_id" text NOT NULL,
	"user_id" integer,
	"story_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"is_featured" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "heroes_of_faith" (
	"hero_id" text PRIMARY KEY NOT NULL,
	"hero_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp (6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"song_id" text PRIMARY KEY NOT NULL,
	"song_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_characters" (
	"character_id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"character_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"openai_key" text,
	"openai_model" text
);
--> statement-breakpoint
CREATE TABLE "user_stories" (
	"story_id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"story_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"is_favorite" boolean DEFAULT false,
	"expires_at" timestamp with time zone,
	"hero_id" text
);
--> statement-breakpoint
CREATE TABLE "user_usage" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0,
	"last_reset_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"verification_token" text,
	"reset_password_token" text,
	"reset_password_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"type" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hero_stories" ADD CONSTRAINT "hero_stories_hero_id_heroes_of_faith_hero_id_fk" FOREIGN KEY ("hero_id") REFERENCES "public"."heroes_of_faith"("hero_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hero_stories" ADD CONSTRAINT "hero_stories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_characters" ADD CONSTRAINT "user_characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_hero_id_heroes_of_faith_hero_id_fk" FOREIGN KEY ("hero_id") REFERENCES "public"."heroes_of_faith"("hero_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_usage" ADD CONSTRAINT "user_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hero_stories_hero_id" ON "hero_stories" USING btree ("hero_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "session" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "idx_user_characters_user_id" ON "user_characters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_stories_user_id" ON "user_stories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_stories_hero_id" ON "user_stories" USING btree ("hero_id");