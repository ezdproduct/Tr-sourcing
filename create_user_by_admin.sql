-- SQL script to define create_user_by_admin function securely in Supabase
-- This fixes the GoTrue 500 login failure by ensuring recovery_token is initialized as an empty string.

CREATE OR REPLACE FUNCTION public.create_user_by_admin(user_email text, user_password text, user_role text, user_department text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  new_user_id UUID := gen_random_uuid();
  new_identity_id UUID := gen_random_uuid();
  hashed_password TEXT;
BEGIN
  -- 1. Double check that the calling user is indeed an admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can create new users.';
  END IF;

  -- 2. Check if user already exists
  IF EXISTS (
    SELECT 1 FROM auth.users WHERE email = user_email
  ) THEN
    RAISE EXCEPTION 'User already registered.';
  END IF;

  -- 3. Hash the password using extensions.crypt
  hashed_password := extensions.crypt(user_password, extensions.gen_salt('bf', 10));

  -- 4. Insert into auth.users
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    aud,
    role,
    confirmation_token,
    recovery_token
  ) VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    user_email,
    hashed_password,
    now(),
    '{"provider":"email","providers":["email"]}',
    json_build_object('role', user_role, 'department', user_department),
    NULL,
    now(),
    now(),
    'authenticated',
    'authenticated',
    '',
    ''
  );

  -- 5. Insert into auth.identities
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    new_identity_id,
    new_user_id,
    json_build_object('sub', new_user_id, 'email', user_email, 'email_verified', true, 'phone_verified', false),
    'email',
    user_email,
    now(),
    now(),
    now()
  );

  -- 6. Force-set default states on profiles table
  UPDATE public.profiles 
  SET is_approved = true, role = user_role, department = user_department
  WHERE id = new_user_id;

  RETURN new_user_id;
END;
$function$;
