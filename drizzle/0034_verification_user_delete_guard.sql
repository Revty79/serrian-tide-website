CREATE OR REPLACE FUNCTION public."guard_verification_deleted_user_reference"()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- A live User value gets a row-key lock. Account deletion therefore either
  -- waits for this verification write and removes it, or wins first and makes
  -- this write continue through the permanent-deletion audit check below.
  PERFORM 1
  FROM public."user"
  WHERE "id" = NEW."value"
  FOR KEY SHARE;

  IF NOT FOUND AND EXISTS (
    SELECT 1
    FROM public."lifecycle_audit_event"
    WHERE "entity_kind" = 'user-account'
      AND "action" = 'delete'
      AND "target_id" = NEW."value"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'verification value references a permanently deleted User account',
      CONSTRAINT = 'verification_value_deleted_user_guard';
  END IF;

  RETURN NEW;
END;
$function$;--> statement-breakpoint
CREATE TRIGGER "verification_deleted_user_reference_guard"
BEFORE INSERT OR UPDATE OF "value" ON public."verification"
FOR EACH ROW
EXECUTE FUNCTION public."guard_verification_deleted_user_reference"();
