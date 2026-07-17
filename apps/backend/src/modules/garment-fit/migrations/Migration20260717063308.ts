import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260717063308 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "variant_fit_metadata" drop constraint if exists "variant_fit_metadata_variant_id_unique";`);
    this.addSql(`alter table if exists "product_fit_metadata" drop constraint if exists "product_fit_metadata_product_id_unique";`);
    this.addSql(`create table if not exists "garment_measurement" ("id" text not null, "product_id" text not null, "size" text not null, "dimension" text not null, "value_cm" integer not null, "version" integer not null default 1, "is_current" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "garment_measurement_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_garment_measurement_deleted_at" ON "garment_measurement" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "product_fit_metadata" ("id" text not null, "product_id" text not null, "fit_descriptor" text check ("fit_descriptor" in ('runs_small', 'true_to_size', 'runs_large')) null, "model_height_cm" integer null, "model_size_worn" text null, "fit_stats_true_to_size_pct" integer null, "fit_stats_sample_size" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_fit_metadata_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_fit_metadata_product_id_unique" ON "product_fit_metadata" ("product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_fit_metadata_deleted_at" ON "product_fit_metadata" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "variant_fit_metadata" ("id" text not null, "variant_id" text not null, "made_to_order" boolean not null default false, "lead_time_days" integer null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "variant_fit_metadata_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_variant_fit_metadata_variant_id_unique" ON "variant_fit_metadata" ("variant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_variant_fit_metadata_deleted_at" ON "variant_fit_metadata" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "garment_measurement" cascade;`);

    this.addSql(`drop table if exists "product_fit_metadata" cascade;`);

    this.addSql(`drop table if exists "variant_fit_metadata" cascade;`);
  }

}
