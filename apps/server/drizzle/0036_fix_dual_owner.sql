-- Fix legacy Owner trigger that blocks UID 1000 bootstrap.
-- Preserve existing protection against Owner removal.

CREATE OR REPLACE FUNCTION public.keyo_protect_owner_roles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_uid bigint;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT uid INTO target_uid
    FROM users WHERE id = OLD.user_id;

    IF OLD.role_id = 'owner' OR target_uid IN (1000, 1002) THEN
      RAISE EXCEPTION 'protected_account: protected role cannot be modified';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT uid INTO target_uid
    FROM users WHERE id = NEW.user_id;

    IF NEW.role_id = 'owner'
       AND (target_uid IS NULL OR target_uid NOT IN (1000, 1002)) THEN
      RAISE EXCEPTION 'protected_account: Owner role is reserved';
    END IF;

    IF target_uid IN (1000, 1002)
       AND NEW.role_id <> 'owner' THEN
      RAISE EXCEPTION 'protected_account: protected account role';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- Assign the missing Owner role to Keyo Captain.
-- Existing UID 1002 Owner assignment remains unchanged.
INSERT INTO user_roles (user_id, role_id)
SELECT id, 'owner'
FROM users
WHERE uid = 1000
  AND account_type IN ('system_support', 'player')
  AND status <> 'deleted'
ON CONFLICT (user_id, role_id) DO NOTHING;
