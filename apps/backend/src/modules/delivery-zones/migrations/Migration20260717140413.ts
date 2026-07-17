import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260717140413 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "delivery_zone" ("id" text not null, "state" text not null, "area" text null, "fee_kobo" integer not null, "eta_min_days" integer not null, "eta_max_days" integer not null, "courier" text check ("courier" in ('gig', 'kwik', 'sendbox', 'manual')) not null, "active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_zone_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_zone_deleted_at" ON "delivery_zone" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "delivery_zone" cascade;`);
  }

}
