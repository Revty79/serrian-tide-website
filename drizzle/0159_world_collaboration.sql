CREATE TABLE "world_access_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"target_id" text,
	"action" text NOT NULL,
	"request_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"outcome" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_access_audit_request" UNIQUE("world_id","actor_id","request_id"),
	CONSTRAINT "world_access_audit_outcome" CHECK ("world_access_audit"."outcome" in ('accepted','denied')),
	CONSTRAINT "world_access_audit_hash" CHECK ("world_access_audit"."input_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "world_editor_lease" (
	"world_id" text PRIMARY KEY NOT NULL,
	"fence" bigint DEFAULT 0 NOT NULL,
	"holder_id" text,
	"session_id" text,
	"client_id" text,
	"token_hash" text,
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_editor_lease_fence" CHECK ("world_editor_lease"."fence">=0 and "world_editor_lease"."fence"<9007199254740991),
	CONSTRAINT "world_editor_lease_identity" CHECK (("world_editor_lease"."holder_id" is null and "world_editor_lease"."session_id" is null and "world_editor_lease"."client_id" is null and "world_editor_lease"."token_hash" is null and "world_editor_lease"."expires_at" is null) or ("world_editor_lease"."holder_id" is not null and "world_editor_lease"."session_id" is not null and "world_editor_lease"."client_id" is not null and "world_editor_lease"."token_hash" is not null and "world_editor_lease"."token_hash" ~ '^[a-f0-9]{64}$' and "world_editor_lease"."expires_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "world_access_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"inviter_id" text NOT NULL,
	"invitee_id" text NOT NULL,
	"world_name" text NOT NULL,
	"inviter_name" text NOT NULL,
	"role" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"protected_content" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "world_access_invitation_world_identity" UNIQUE("world_id","id","invitee_id"),
	CONSTRAINT "world_access_invitation_scopes" CHECK (jsonb_typeof("world_access_invitation"."scopes")='array' and jsonb_array_length("world_access_invitation"."scopes") between 1 and 17 and "world_access_invitation"."scopes" <@ '["overview","history","timekeeping","peoples","individuals","politics","organizations","cosmology","stories","settlements","atlas","interiors","underground","craft","appearances","assets","campaigns"]'::jsonb and (not ("world_access_invitation"."scopes" @> '["appearances"]'::jsonb) or "world_access_invitation"."scopes" @> '["history"]'::jsonb)),
	CONSTRAINT "world_access_invitation_role" CHECK ("world_access_invitation"."role" in ('viewer','editor')),
	CONSTRAINT "world_access_invitation_state" CHECK ("world_access_invitation"."state" in ('pending','accepted','declined','revoked','expired')),
	CONSTRAINT "world_access_invitation_revision" CHECK ("world_access_invitation"."revision">0),
	CONSTRAINT "world_access_invitation_expiry" CHECK ("world_access_invitation"."expires_at">"world_access_invitation"."created_at")
);
--> statement-breakpoint
CREATE TABLE "world_access_participant" (
	"world_id" text NOT NULL,
	"user_id" text NOT NULL,
	"invitation_id" text NOT NULL,
	"role" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"protected_content" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"granted_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_at" timestamp with time zone,
	"control_request_id" text,
	"request_client_id" text,
	"request_session_id" text,
	"request_token_hash" text,
	CONSTRAINT "world_access_participant_world_id_user_id_pk" PRIMARY KEY("world_id","user_id"),
	CONSTRAINT "world_access_participant_scopes" CHECK (jsonb_typeof("world_access_participant"."scopes")='array' and jsonb_array_length("world_access_participant"."scopes") between 1 and 17 and "world_access_participant"."scopes" <@ '["overview","history","timekeeping","peoples","individuals","politics","organizations","cosmology","stories","settlements","atlas","interiors","underground","craft","appearances","assets","campaigns"]'::jsonb and (not ("world_access_participant"."scopes" @> '["appearances"]'::jsonb) or "world_access_participant"."scopes" @> '["history"]'::jsonb)),
	CONSTRAINT "world_access_participant_role" CHECK ("world_access_participant"."role" in ('viewer','editor')),
	CONSTRAINT "world_access_participant_state" CHECK ("world_access_participant"."state" in ('active','suspended','revoked')),
	CONSTRAINT "world_access_participant_revision" CHECK ("world_access_participant"."revision">0),
	CONSTRAINT "world_access_participant_control_request" CHECK (("world_access_participant"."control_request_id" is null and "world_access_participant"."requested_at" is null and "world_access_participant"."request_client_id" is null and "world_access_participant"."request_session_id" is null and "world_access_participant"."request_token_hash" is null) or ("world_access_participant"."control_request_id" is not null and "world_access_participant"."requested_at" is not null and "world_access_participant"."request_client_id" is not null and "world_access_participant"."request_session_id" is not null and "world_access_participant"."request_token_hash" is not null and "world_access_participant"."request_token_hash" ~ '^[a-f0-9]{64}$'))
);
--> statement-breakpoint
ALTER TABLE "world" ADD CONSTRAINT "world_identity_owner" UNIQUE("id","owner_id");
--> statement-breakpoint
ALTER TABLE "world_access_audit" ADD CONSTRAINT "world_access_audit_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_access_audit" ADD CONSTRAINT "world_access_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_access_audit" ADD CONSTRAINT "world_access_audit_target_id_user_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_editor_lease" ADD CONSTRAINT "world_editor_lease_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_editor_lease" ADD CONSTRAINT "world_editor_lease_holder_id_user_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_access_invitation" ADD CONSTRAINT "world_access_invitation_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_access_invitation" ADD CONSTRAINT "world_access_invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_access_invitation" ADD CONSTRAINT "world_access_invitation_invitee_id_user_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_access_invitation" ADD CONSTRAINT "world_access_invitation_owner_fk" FOREIGN KEY ("world_id","inviter_id") REFERENCES "public"."world"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_access_participant" ADD CONSTRAINT "world_access_participant_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_access_participant" ADD CONSTRAINT "world_access_participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_access_participant" ADD CONSTRAINT "world_access_participant_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_access_participant" ADD CONSTRAINT "world_access_participant_invitation_fk" FOREIGN KEY ("world_id","invitation_id","user_id") REFERENCES "public"."world_access_invitation"("world_id","id","invitee_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_access_participant" ADD CONSTRAINT "world_access_participant_owner_fk" FOREIGN KEY ("world_id","granted_by") REFERENCES "public"."world"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_access_audit_world_time" ON "world_access_audit" USING btree ("world_id","created_at","id");--> statement-breakpoint
CREATE INDEX "world_access_audit_invitation_rate" ON "world_access_audit" USING btree ("actor_id","action","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "world_access_invitation_pending_target" ON "world_access_invitation" USING btree ("world_id","invitee_id") WHERE "world_access_invitation"."state"='pending';--> statement-breakpoint
CREATE INDEX "world_access_invitation_inbox" ON "world_access_invitation" USING btree ("invitee_id","state","created_at");--> statement-breakpoint
CREATE INDEX "world_access_invitation_world" ON "world_access_invitation" USING btree ("world_id","state");--> statement-breakpoint
CREATE INDEX "world_access_participant_user" ON "world_access_participant" USING btree ("user_id","state","world_id");--> statement-breakpoint
CREATE INDEX "world_registry_name_idx" ON "world" USING btree (lower("name") text_pattern_ops,"id");--> statement-breakpoint
CREATE INDEX "world_registry_name_sort_idx" ON "world" USING btree (lower("name"),"id");--> statement-breakpoint
CREATE INDEX "world_registry_created_idx" ON "world" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "world_registry_activity_idx" ON "world" USING btree ("updated_at","id");--> statement-breakpoint

--> statement-breakpoint
CREATE FUNCTION world_access_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'World access audit records are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER world_access_audit_no_update_delete BEFORE UPDATE OR DELETE ON world_access_audit FOR EACH ROW EXECUTE FUNCTION world_access_audit_immutable();

--> statement-breakpoint
CREATE FUNCTION world_collaboration_author(world_identity text, author_identity text, required_scopes text[]) RETURNS boolean LANGUAGE sql AS $$
 SELECT EXISTS(SELECT 1 FROM world w WHERE w.id=world_identity AND w.archived_at IS NULL AND (
   w.owner_id=author_identity OR EXISTS(
     SELECT 1 FROM world_access_participant p JOIN world_editor_lease l ON l.world_id=p.world_id AND l.holder_id=p.user_id
     JOIN "session" s ON s.id=l.session_id AND s.user_id=l.holder_id
     WHERE p.world_id=w.id AND p.user_id=author_identity AND p.state='active' AND p.role='editor' AND p.scopes ?& required_scopes
       AND l.expires_at>clock_timestamp() AND s.expires_at AT TIME ZONE 'UTC'>clock_timestamp()
       AND EXISTS(SELECT 1 FROM user_role r WHERE r.user_id=author_identity AND r.role IN ('god','admin','player'))
   )
 ));
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_region_hierarchy_validate() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
DECLARE region_row record; parent_row record; owner_row record; has_cycle boolean; maximum_depth integer;
BEGIN
 SELECT * INTO owner_row FROM world WHERE id=NEW.world_id FOR UPDATE;
 IF NOT FOUND OR owner_row.archived_at IS NOT NULL OR NOT world_collaboration_author(NEW.world_id,NEW.updated_by_user_id,ARRAY['atlas']) THEN RAISE EXCEPTION 'Only the active World owner may change region organization.'; END IF;
 SELECT * INTO region_row FROM world_map_region WHERE map_id=NEW.map_id AND world_id=NEW.world_id;
 IF NOT FOUND OR region_row.terrain_id<>NEW.terrain_id OR region_row.parent_map_id<>NEW.source_world_map_id THEN RAISE EXCEPTION 'Organization must retain the region source World and terrain.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM world_atlas_map WHERE id=NEW.map_id AND world_id=NEW.world_id AND archived_at IS NULL) OR NOT EXISTS(SELECT 1 FROM world_atlas_map WHERE id=NEW.source_world_map_id AND world_id=NEW.world_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'Restore an archived map or its source before organizing it.'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.revision<>1 THEN RAISE EXCEPTION 'A hierarchy starts at revision one.'; END IF;
 ELSE
  IF (NEW.map_id,NEW.world_id,NEW.terrain_id,NEW.source_world_map_id,NEW.source_purpose,NEW.created_at) IS DISTINCT FROM (OLD.map_id,OLD.world_id,OLD.terrain_id,OLD.source_world_map_id,OLD.source_purpose,OLD.created_at) THEN RAISE EXCEPTION 'Hierarchy source identities are immutable.'; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Hierarchy revision conflict.'; END IF;
 END IF;
 IF NEW.organizing_parent_id IS NOT NULL THEN
  SELECT pr.*,m.archived_at INTO parent_row FROM world_map_region pr JOIN world_atlas_map m ON m.id=pr.map_id AND m.world_id=pr.world_id WHERE pr.map_id=NEW.organizing_parent_id AND pr.world_id=NEW.world_id;
  IF NOT FOUND OR parent_row.archived_at IS NOT NULL OR parent_row.terrain_id<>NEW.terrain_id OR parent_row.parent_map_id<>NEW.source_world_map_id OR parent_row.map_id=NEW.map_id THEN RAISE EXCEPTION 'Choose another active region in the same source World and terrain.'; END IF;
 END IF;
 WITH RECURSIVE proposed AS (
  SELECT r.map_id,CASE WHEN r.map_id=NEW.map_id THEN NEW.organizing_parent_id ELSE h.organizing_parent_id END AS parent_id
  FROM world_map_region r LEFT JOIN world_region_hierarchy h ON h.map_id=r.map_id AND h.world_id=r.world_id
  WHERE r.world_id=NEW.world_id AND r.parent_map_id=NEW.source_world_map_id
 ), walk AS (
  SELECT map_id AS start_id,map_id,parent_id,ARRAY[map_id] AS path,1 AS depth,false AS cycle FROM proposed
  UNION ALL
  SELECT w.start_id,p.map_id,p.parent_id,w.path||p.map_id,w.depth+1,p.map_id=ANY(w.path)
  FROM walk w JOIN proposed p ON p.map_id=w.parent_id WHERE NOT w.cycle AND w.depth<=16
 ) SELECT coalesce(bool_or(cycle),false),coalesce(max(depth),0) INTO has_cycle,maximum_depth FROM walk;
 IF has_cycle THEN RAISE EXCEPTION 'Region organization cannot contain a cycle.'; END IF;
 IF maximum_depth>16 THEN RAISE EXCEPTION 'Keep the complete hierarchy within 16 regional levels.'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_native_map_state_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE manifest jsonb; source jsonb; resource jsonb; dependency jsonb; kind text; target_id text;
BEGIN
 manifest:=NEW.payload->'nativeAtlas';
 IF NEW.state_id IS NOT NULL AND EXISTS(SELECT 1 FROM world_map_state_version prior WHERE prior.world_id=NEW.world_id AND prior.state_id=NEW.state_id AND prior.id<>NEW.id AND (prior.payload->'nativeAtlas'->'target') IS DISTINCT FROM (manifest->'target')) THEN RAISE EXCEPTION 'A historical appearance retains its original native or legacy map identity'; END IF;
 SELECT payload->'nativeAtlas' INTO source FROM world_map_state_version WHERE id=NEW.source_version_id;
 IF manifest IS NULL THEN
  IF source IS NOT NULL THEN RAISE EXCEPTION 'Retain the native historical source binding'; END IF;
  RETURN NEW;
 END IF;
 IF source IS NOT NULL AND source->'target'<>manifest->'target' THEN RAISE EXCEPTION 'Native historical sources must retain the same map identity'; END IF;
 IF NEW.source_version_id IS NOT NULL AND source IS NULL THEN RAISE EXCEPTION 'A native appearance requires a compatible native source'; END IF;
 IF NOT world_collaboration_author(NEW.world_id,NEW.author_id,ARRAY['history','appearances',CASE manifest->'target'->>'kind' WHEN 'terrain' THEN 'atlas' WHEN 'town' THEN 'settlements' WHEN 'floor' THEN 'interiors' WHEN 'underground' THEN 'underground' WHEN 'craft' THEN 'craft' WHEN 'deck' THEN 'craft' ELSE 'unreviewed' END]) THEN RAISE EXCEPTION 'Native historical authoring belongs to the World owner'; END IF;
 kind:=manifest->'target'->>'kind'; target_id:=manifest->'target'->>'id';
 IF kind='terrain' AND NOT EXISTS(SELECT 1 FROM world_map_canvas c WHERE c.map_id=target_id AND c.world_id=NEW.world_id AND (c.map_id=NEW.map_id OR EXISTS(SELECT 1 FROM world_map_region r WHERE r.map_id=c.map_id AND r.world_id=c.world_id AND r.parent_map_id=NEW.map_id)))
 OR kind='town' AND NOT EXISTS(SELECT 1 FROM world_town_map t WHERE t.id=target_id AND t.world_id=NEW.world_id AND t.source_map_id=NEW.map_id)
 OR kind='floor' AND NOT EXISTS(SELECT 1 FROM world_building_floor f JOIN world_building_interior_source b ON b.building_id=f.building_id AND b.world_id=f.world_id JOIN world_town_map t ON t.id=b.town_map_id AND t.world_id=b.world_id WHERE f.id=target_id AND f.world_id=NEW.world_id AND t.source_map_id=NEW.map_id)
 OR kind='underground' AND NOT EXISTS(SELECT 1 FROM world_underground_level l WHERE l.id=target_id AND l.world_id=NEW.world_id)
 OR kind='craft' AND NOT EXISTS(SELECT 1 FROM world_craft c WHERE c.id=target_id AND c.world_id=NEW.world_id)
 OR kind='deck' AND NOT EXISTS(SELECT 1 FROM world_craft_deck d WHERE d.id=target_id AND d.world_id=NEW.world_id)
 THEN RAISE EXCEPTION 'Native historical target belongs to another World or geographic source'; END IF;
 IF (SELECT count(*) FROM world_map_state_component_ref WHERE version_id=NEW.id)<>jsonb_array_length(manifest->'resources') THEN RAISE EXCEPTION 'Historical component references are incomplete'; END IF;
 FOR resource IN SELECT value FROM jsonb_array_elements(manifest->'resources') LOOP
  IF NOT EXISTS(SELECT 1 FROM world_map_state_component_ref r JOIN world_map_state_component c ON c.id=r.component_id AND c.world_id=r.world_id WHERE r.version_id=NEW.id AND r.world_id=NEW.world_id AND r.map_id=NEW.map_id AND r.key=resource->>'key' AND c.id=resource->>'componentId' AND c.kind=resource->>'kind') THEN RAISE EXCEPTION 'Historical component source mismatch'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM world_map_state_native_dependency WHERE version_id=NEW.id)<>jsonb_array_length(manifest->'dependencies') THEN RAISE EXCEPTION 'Historical dependency references are incomplete'; END IF;
 FOR dependency IN SELECT value FROM jsonb_array_elements(manifest->'dependencies') LOOP
  IF NOT EXISTS(SELECT 1 FROM world_map_state_native_dependency d JOIN world_map_state_version s ON s.id=d.source_version_id AND s.world_id=d.world_id AND s.map_id=d.source_map_id WHERE d.version_id=NEW.id AND d.world_id=NEW.world_id AND d.source_version_id=dependency->>'versionId' AND s.payload->'nativeAtlas'->'target'=dependency->'target') THEN RAISE EXCEPTION 'Historical dependency source mismatch'; END IF;
 END LOOP;
 IF EXISTS(WITH RECURSIVE dependencies(id) AS (SELECT source_version_id FROM world_map_state_native_dependency WHERE version_id=NEW.id UNION SELECT d.source_version_id FROM dependencies p JOIN world_map_state_native_dependency d ON d.version_id=p.id) SELECT 1 FROM dependencies WHERE id=NEW.id) THEN RAISE EXCEPTION 'Historical source dependencies cannot cycle'; END IF;
 IF EXISTS(WITH RECURSIVE sources(id) AS (
  SELECT NEW.source_version_id WHERE NEW.source_version_id IS NOT NULL UNION SELECT NEW.previous_version_id WHERE NEW.previous_version_id IS NOT NULL
  UNION SELECT n.id FROM sources s JOIN world_map_state_version v ON v.id=s.id CROSS JOIN LATERAL(SELECT v.source_version_id id UNION SELECT v.previous_version_id) n WHERE n.id IS NOT NULL
 ) SELECT 1 FROM sources WHERE id=NEW.id) THEN RAISE EXCEPTION 'Historical native sources cannot cycle'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_native_territory_component_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE src world_map_state_version; previous jsonb; t jsonb; r jsonb; h jsonb; root_doc jsonb; row_version world_lore_version; label text; p jsonb;
BEGIN
 IF NEW.kind<>'places' OR NOT NEW.payload ? 'territories' THEN RETURN NEW; END IF;
 p:=NEW.payload;
 IF p-ARRAY['version','revision','source','territories']<>'{}'::jsonb OR jsonb_typeof(p->'version')<>'number' OR p->>'version'<>'1' OR jsonb_typeof(p->'revision')<>'number' OR (p->>'revision')::integer<1 OR NOT p ?& ARRAY['version','revision','source','territories'] THEN RAISE EXCEPTION 'Invalid native political component'; END IF;
 IF jsonb_typeof(p->'source')<>'object' OR NOT (p->'source') ?& ARRAY['mapId','mapVersionId','timelineId','year','terrainId','fingerprint','width','height','wrap'] OR (p->'source')-ARRAY['mapId','mapVersionId','timelineId','year','terrainId','fingerprint','width','height','wrap']<>'{}'::jsonb OR jsonb_typeof(p->'source'->'year')<>'number' OR abs((p->'source'->>'year')::numeric)>1000000000000 OR trunc((p->'source'->>'year')::numeric)<>(p->'source'->>'year')::numeric OR jsonb_typeof(p->'source'->'fingerprint')<>'string' OR (p->'source'->>'fingerprint') !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p->'source'->'width')<>'number' OR jsonb_typeof(p->'source'->'height')<>'number' OR jsonb_typeof(p->'source'->'wrap')<>'boolean' THEN RAISE EXCEPTION 'Invalid reviewed native political source'; END IF;
 SELECT * INTO src FROM world_map_state_version WHERE id=p->'source'->>'mapVersionId' AND world_id=NEW.world_id AND map_id=p->'source'->>'mapId';
 IF src.id IS NULL OR src.state_id IS NULL OR src.archived OR src.payload->'nativeAtlas'->'target'->>'kind'<>'terrain' OR src.payload->'nativeAtlas'->'target'->>'id'<>src.map_id OR (p->'source'->>'year')::numeric NOT BETWEEN src.start_year AND src.end_year THEN RAISE EXCEPTION 'Political component requires an exact dated World source'; END IF;
 IF NOT world_collaboration_author(NEW.world_id,NEW.author_id,ARRAY['history','appearances','atlas','politics']) OR NOT EXISTS(SELECT 1 FROM world_timeline WHERE id=p->'source'->>'timelineId' AND world_id=NEW.world_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'Native political authorship belongs to the World owner and selected timeline'; END IF;
 IF NOT EXISTS(SELECT 1 FROM world_map_state_head head JOIN world_map_state_version v ON v.id=head.version_id AND v.world_id=head.world_id WHERE head.world_id=NEW.world_id AND head.timeline_id=p->'source'->>'timelineId' AND head.state_id=src.state_id AND (v.id=src.id OR v.previous_version_id=src.id)) THEN RAISE EXCEPTION 'Review the actual selected World source before political authoring'; END IF;
 SELECT c.payload#>'{bundle,document}' INTO root_doc FROM world_map_state_component_ref ref JOIN world_map_state_component c ON c.id=ref.component_id AND c.world_id=ref.world_id WHERE ref.version_id=src.id AND ref.world_id=NEW.world_id AND ref.key='terrain';
 IF root_doc->>'terrainId' IS DISTINCT FROM p->'source'->>'terrainId' OR (root_doc#>>'{settings,widthKm}')::float8*1000 IS DISTINCT FROM (p->'source'->>'width')::float8 OR (root_doc#>>'{settings,heightKm}')::float8*1000 IS DISTINCT FROM (p->'source'->>'height')::float8 OR (root_doc#>>'{settings,wrap}')::boolean IS DISTINCT FROM (p->'source'->>'wrap')::boolean THEN RAISE EXCEPTION 'Native political extent must retain its real World terrain identity'; END IF;
 IF world_native_map_territories_valid(p->'territories',(p->'source'->>'width')::numeric,(p->'source'->>'height')::numeric,(p->'source'->>'wrap')::boolean) IS NOT TRUE THEN RAISE EXCEPTION 'Invalid native political geometry or account'; END IF;
 SELECT c.payload INTO previous FROM world_map_state_component_ref ref JOIN world_map_state_component c ON c.id=ref.component_id AND c.world_id=ref.world_id WHERE ref.version_id=src.id AND ref.world_id=NEW.world_id AND ref.key='territories';
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(previous->'territories','[]'::jsonb)) prior_territory WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'territories') current WHERE current->>'id'=prior_territory->>'id')) THEN RAISE EXCEPTION 'Retain native historical territory identities'; END IF;
 FOR t IN SELECT value FROM jsonb_array_elements(p->'territories') LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(previous->'territories','[]'::jsonb)) prior_territory CROSS JOIN LATERAL jsonb_array_elements(prior_territory->'boundaries') ring WHERE prior_territory->>'id'=t->>'id' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(t->'boundaries') current WHERE current->>'id'=ring->>'id')) THEN RAISE EXCEPTION 'Retain native historical boundary identities'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(t->'relationships') LOOP
   IF (r->>'startYear')::numeric<src.start_year OR (r->>'endYear')::numeric>src.end_year THEN RAISE EXCEPTION 'New political accounts must fit their reviewed source appearance period'; END IF;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(previous->'territories','[]'::jsonb)) prior_territory CROSS JOIN LATERAL jsonb_array_elements(prior_territory->'relationships') pin WHERE prior_territory->>'id'=t->>'id' AND pin->>'id'=r->>'id' AND pin->>'entityId'=r->>'entityId' AND pin->>'versionId'=r->>'versionId' AND pin->>'revision'=r->>'revision' AND pin->>'entityName'=r->>'entityName' AND pin->>'family'=r->>'family') AND NOT EXISTS(SELECT 1 FROM world_lore_head selected JOIN world_lore_version v ON v.id=selected.version_id AND v.world_id=selected.world_id JOIN world_lore_display display ON display.version_id=v.id WHERE selected.world_id=NEW.world_id AND selected.timeline_id=p->'source'->>'timelineId' AND selected.entity_id=r->>'entityId' AND selected.version_id=r->>'versionId' AND selected.revision=(r->>'revision')::integer AND selected.mode IN('authored','inherited','interpretation') AND NOT v.archived AND display.name=r->>'entityName' AND v.family=r->>'family') THEN RAISE EXCEPTION 'Political source is not selected or retained in this timeline'; END IF;
  END LOOP;
  FOR h IN SELECT value FROM jsonb_array_elements(t->'history') LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(previous->'territories','[]'::jsonb)) prior_territory CROSS JOIN LATERAL jsonb_array_elements(prior_territory->'history') pin WHERE prior_territory->>'id'=t->>'id' AND pin->>'entityId'=h->>'entityId' AND pin->>'versionId'=h->>'versionId' AND pin->>'name'=h->>'name') AND NOT EXISTS(SELECT 1 FROM world_history_head selected JOIN world_history_version v ON v.id=selected.version_id AND v.world_id=selected.world_id WHERE selected.world_id=NEW.world_id AND selected.timeline_id=p->'source'->>'timelineId' AND selected.entity_id=h->>'entityId' AND selected.version_id=h->>'versionId' AND selected.mode IN('authored','inherited','partial','interpretation') AND coalesce(v.payload->>'title',v.payload->>'name')=h->>'name' AND NOT coalesce((v.payload->>'archived')::boolean,false)) THEN RAISE EXCEPTION 'History citation is not selected or retained in this timeline'; END IF;
  END LOOP;
 END LOOP;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_territory_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t jsonb; b jsonb; r jsonb; h jsonb; old jsonb; v world_lore_version; label text; expected integer:=0; expected_history integer:=0;
BEGIN
 IF NEW.payload ? 'nativeAtlas' THEN PERFORM world_native_map_territory_complete(NEW); RETURN NEW; END IF;
 SELECT payload INTO old FROM world_map_state_version WHERE id=coalesce(NEW.previous_version_id,NEW.source_version_id);
 IF jsonb_array_length(coalesce(NEW.payload->'territories','[]'::jsonb))>0 AND NOT world_collaboration_author(NEW.world_id,NEW.author_id,ARRAY['history','appearances','atlas','politics']) THEN RAISE EXCEPTION 'Historical political authorship belongs to the World owner'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(old->'territories','[]'::jsonb)) prior WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(NEW.payload->'territories','[]'::jsonb)) current WHERE current->>'id'=prior->>'id')) THEN RAISE EXCEPTION 'Retain historical territory identities'; END IF;
 FOR t IN SELECT value FROM jsonb_array_elements(coalesce(NEW.payload->'territories','[]'::jsonb)) LOOP
  IF NEW.state_id IS NULL OR NOT EXISTS (SELECT 1 FROM world_map_territory WHERE id=t->>'id' AND world_id=NEW.world_id AND map_id=NEW.map_id) THEN RAISE EXCEPTION 'Territory belongs to a historical map appearance'; END IF;
  FOR b IN SELECT value FROM jsonb_array_elements(t->'boundaries') LOOP
   IF NOT EXISTS (SELECT 1 FROM world_map_territory_boundary WHERE id=b->>'id' AND world_id=NEW.world_id AND map_id=NEW.map_id AND territory_id=t->>'id' AND parent_id IS NOT DISTINCT FROM b->>'parentId') THEN RAISE EXCEPTION 'Territory boundary identity mismatch'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(old->'territories','[]'::jsonb)) prior CROSS JOIN LATERAL jsonb_array_elements(prior->'boundaries') ring WHERE prior->>'id'=t->>'id' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t->'boundaries') current WHERE current->>'id'=ring->>'id')) THEN RAISE EXCEPTION 'Retain historical boundary identities'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(t->'geographyIds') g WHERE NOT EXISTS (SELECT 1 FROM world_map_state_geography WHERE version_id=NEW.id AND geography_id=g.value AND world_id=NEW.world_id) OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payload->'geographies') local_geo WHERE local_geo->>'id'=g.value)) THEN RAISE EXCEPTION 'Territory geography mismatch'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(t->'relationships') LOOP
   expected:=expected+1;
   IF (r->>'startYear')::numeric<NEW.start_year OR (r->>'endYear')::numeric>NEW.end_year THEN RAISE EXCEPTION 'Political relationship dates must fit the authored appearance period'; END IF;
   SELECT * INTO v FROM world_lore_version WHERE id=r->>'versionId' AND entity_id=r->>'entityId' AND world_id=NEW.world_id;
   SELECT name INTO label FROM world_lore_display WHERE version_id=v.id;
   IF v.id IS NULL OR v.family<>r->>'family' OR label IS DISTINCT FROM r->>'entityName' OR NOT EXISTS (SELECT 1 FROM world_map_territory_lore WHERE version_id=NEW.id AND territory_id=t->>'id' AND id=r->>'id' AND entity_id=r->>'entityId' AND lore_version_id=r->>'versionId') THEN RAISE EXCEPTION 'Exact political source mismatch'; END IF;
   IF EXISTS (SELECT 1 FROM world_map_territory_lore WHERE id=r->>'id' AND (territory_id<>t->>'id' OR entity_id<>r->>'entityId')) THEN RAISE EXCEPTION 'Political relationship identity cannot be reassigned'; END IF;
   IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(old->'territories','[]'::jsonb)) prior CROSS JOIN LATERAL jsonb_array_elements(prior->'relationships') pin WHERE prior->>'id'=t->>'id' AND pin->>'id'=r->>'id' AND pin->>'versionId'=r->>'versionId' AND pin->>'revision'=r->>'revision') AND NOT EXISTS (SELECT 1 FROM world_lore_head selected JOIN world_lore_version current ON current.id=selected.version_id WHERE selected.world_id=NEW.world_id AND selected.timeline_id=NEW.timeline_id AND selected.entity_id=r->>'entityId' AND selected.version_id=r->>'versionId' AND selected.revision=(r->>'revision')::integer AND selected.mode IN ('authored','inherited','interpretation') AND NOT current.archived) THEN RAISE EXCEPTION 'Political source not selected in this timeline'; END IF;
  END LOOP;
  FOR h IN SELECT value FROM jsonb_array_elements(t->'history') LOOP
   expected_history:=expected_history+1;
   IF NOT EXISTS (SELECT 1 FROM world_map_territory_history pin JOIN world_history_version source ON source.id=pin.history_version_id WHERE pin.version_id=NEW.id AND pin.territory_id=t->>'id' AND pin.entity_id=h->>'entityId' AND pin.history_version_id=h->>'versionId' AND coalesce(source.payload->>'title',source.payload->>'name')=h->>'name') THEN RAISE EXCEPTION 'Exact History source mismatch'; END IF;
   IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(old->'territories','[]'::jsonb)) prior CROSS JOIN LATERAL jsonb_array_elements(prior->'history') pin WHERE prior->>'id'=t->>'id' AND pin->>'entityId'=h->>'entityId' AND pin->>'versionId'=h->>'versionId') AND NOT EXISTS (SELECT 1 FROM world_history_head WHERE world_id=NEW.world_id AND timeline_id=NEW.timeline_id AND entity_id=h->>'entityId' AND version_id=h->>'versionId' AND mode IN ('authored','inherited','partial','interpretation')) THEN RAISE EXCEPTION 'History source not selected in this timeline'; END IF;
  END LOOP;
 END LOOP;
 IF expected<>(SELECT count(*) FROM world_map_territory_lore WHERE version_id=NEW.id) OR expected_history<>(SELECT count(*) FROM world_map_territory_history WHERE version_id=NEW.id) THEN RAISE EXCEPTION 'Historical political references incomplete'; END IF;
 RETURN NEW;
END $$;

--> statement-breakpoint
CREATE FUNCTION world_collaboration_lore_scope(family text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN family='individual' THEN 'individuals' WHEN family='story' THEN 'stories'
 WHEN family IN ('polity','government','institution','office','appointment','claim','agreement','conflict') THEN 'politics'
 WHEN family IN ('organization','organizationRole','membership','assignment','network') THEN 'organizations'
 WHEN family IN ('cosmicFramework','realm','celestial','cosmicPrinciple','cosmicConnection','skyCycle','skyObservation','skyCalendarLink') THEN 'cosmology'
 WHEN family IN ('species','people','origin','relationship','culture','civilization','language','population','belief','tradition') THEN 'peoples' ELSE 'unreviewed' END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_lore_author_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id text; actor text;
BEGIN
 SELECT w.owner_id INTO owner_id FROM world w WHERE w.id=NEW.world_id;
 IF TG_TABLE_NAME='world_lore_identity' THEN actor:=NEW.creator_id; ELSIF TG_TABLE_NAME='world_lore_version' THEN actor:=NEW.author_id; ELSE actor:=NEW.actor_id; END IF;
 IF TG_TABLE_NAME IN ('world_lore_identity','world_lore_version') THEN
    IF NOT world_collaboration_author(NEW.world_id,actor,ARRAY[world_collaboration_lore_scope(NEW.family)]) THEN RAISE EXCEPTION 'World authorship requires current scoped editing authority'; END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM world_lore_identity i WHERE i.id=NEW.entity_id AND i.world_id=NEW.world_id AND world_collaboration_author(NEW.world_id,actor,ARRAY[world_collaboration_lore_scope(i.family)])) THEN RAISE EXCEPTION 'World authorship requires current scoped editing authority'; END IF;
  END IF;
 IF TG_TABLE_NAME='world_lore_change' THEN
 IF NOT EXISTS (SELECT 1 FROM world_lore_head h WHERE h.world_id=NEW.world_id AND h.timeline_id=NEW.timeline_id AND h.entity_id=NEW.entity_id AND h.version_id=NEW.version_id AND h.revision=NEW.revision) THEN RAISE EXCEPTION 'Audit must record the current entity head'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_connection_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior world_map_connection_version; b jsonb; label text; owner text; selected_id text;
BEGIN
 SELECT owner_id INTO owner FROM world WHERE id=NEW.world_id FOR UPDATE;
 IF NOT world_collaboration_author(NEW.world_id,NEW.author_id,ARRAY['history','appearances','atlas']) THEN RAISE EXCEPTION 'Historical connection authorship belongs to the World owner'; END IF;
 IF NEW.previous_version_id IS NOT NULL THEN
  SELECT * INTO prior FROM world_map_connection_version WHERE id=NEW.previous_version_id;
  SELECT version_id INTO selected_id FROM world_map_connection_head WHERE world_id=NEW.world_id AND timeline_id=NEW.timeline_id AND connection_id=NEW.connection_id;
  IF selected_id IS DISTINCT FROM prior.id THEN RAISE EXCEPTION 'Historical connection previous source must be its selected head'; END IF;
  IF NEW.source_version_id IS DISTINCT FROM (CASE WHEN prior.timeline_id=NEW.timeline_id THEN prior.source_version_id ELSE prior.id END) THEN RAISE EXCEPTION 'Retain the exact historical connection source chain'; END IF;
 ELSIF NEW.source_version_id IS NOT NULL THEN
  SELECT * INTO prior FROM world_map_connection_version WHERE id=NEW.source_version_id;
  IF NOT EXISTS(WITH RECURSIVE sources(id) AS (SELECT version_id FROM world_map_connection_head WHERE world_id=NEW.world_id AND timeline_id=NEW.timeline_id AND map_id=NEW.map_id UNION SELECT n.id FROM sources s JOIN world_map_connection_version v ON v.id=s.id CROSS JOIN LATERAL(SELECT v.previous_version_id AS id UNION SELECT v.source_version_id) n WHERE n.id IS NOT NULL) SELECT 1 FROM sources WHERE id=NEW.source_version_id) THEN RAISE EXCEPTION 'Choose an exact connection source retained by this timeline'; END IF;
 END IF;
 SELECT name INTO label FROM world_geography WHERE id=NEW.geography_id AND world_id=NEW.world_id;
 IF NEW.source->>'placeName' IS DISTINCT FROM coalesce(prior.source->>'placeName',label) THEN RAISE EXCEPTION 'Historical connection place source mismatch'; END IF;
 IF prior.id IS NOT NULL THEN IF NEW.source->'baseline' IS DISTINCT FROM prior.source->'baseline' OR (NOT (prior.source->>'ordinary')::boolean AND (NEW.source->>'ordinary')::boolean) THEN RAISE EXCEPTION 'Retain the original shared connection source and protection'; END IF;
 ELSE
  b:=NEW.source->'baseline';
  IF EXISTS(SELECT 1 FROM world_atlas_connection WHERE world_id=NEW.world_id AND source_map_id=NEW.map_id AND geography_id=NEW.geography_id) AND b='null'::jsonb THEN RAISE EXCEPTION 'Capture the shared connection source explicitly'; END IF;
  IF b<>'null'::jsonb AND NOT EXISTS(SELECT 1 FROM world_atlas_connection WHERE id=b->>'id' AND world_id=NEW.world_id AND source_map_id=NEW.map_id AND geography_id=NEW.geography_id AND revision=(b->>'revision')::integer AND destination_map_id=NEW.baseline_destination_map_id AND destination_geography_id IS NOT DISTINCT FROM NEW.baseline_arrival_id) THEN RAISE EXCEPTION 'Exact shared connection source mismatch'; END IF;
 END IF;
 IF NEW.destination_map_id IS NOT NULL THEN
  SELECT name INTO label FROM world_atlas_map WHERE id=NEW.destination_map_id AND world_id=NEW.world_id;
  IF NEW.previous_version_id IS NULL OR NEW.destination_map_id IS DISTINCT FROM prior.destination_map_id OR NEW.source->>'destinationName' IS DISTINCT FROM prior.source->>'destinationName' THEN IF NEW.source->>'destinationName' IS DISTINCT FROM label THEN RAISE EXCEPTION 'Historical destination source mismatch'; END IF; END IF;
 END IF;
 IF NEW.destination_geography_id IS NOT NULL THEN
  SELECT name INTO label FROM world_geography WHERE id=NEW.destination_geography_id AND world_id=NEW.world_id;
  IF NEW.previous_version_id IS NULL OR NEW.destination_geography_id IS DISTINCT FROM prior.destination_geography_id OR NEW.source->>'arrivalName' IS DISTINCT FROM prior.source->>'arrivalName' THEN IF NEW.source->>'arrivalName' IS DISTINCT FROM label THEN RAISE EXCEPTION 'Historical arrival source mismatch'; END IF; END IF;
  IF NOT world_map_connection_arrival_valid(NEW.destination_map_id,NEW.world_id,NEW.destination_geography_id) THEN RAISE EXCEPTION 'Historical arrival belongs to its destination representation'; END IF;
 END IF;
 IF (NEW.source->>'ordinary')::boolean AND (NOT world_map_connection_place_ordinary(NEW.world_id,NEW.geography_id) OR (NEW.destination_map_id IS NOT NULL AND NOT world_map_connection_map_ordinary(NEW.world_id,NEW.destination_map_id)) OR (NEW.destination_geography_id IS NOT NULL AND NOT world_map_connection_place_ordinary(NEW.world_id,NEW.destination_geography_id)) OR (NEW.baseline_destination_map_id IS NOT NULL AND NOT world_map_connection_map_ordinary(NEW.world_id,NEW.baseline_destination_map_id)) OR (NEW.baseline_arrival_id IS NOT NULL AND NOT world_map_connection_place_ordinary(NEW.world_id,NEW.baseline_arrival_id))) THEN RAISE EXCEPTION 'Retain captured protected connection subjects'; END IF;
 RETURN NEW;
END $$;
