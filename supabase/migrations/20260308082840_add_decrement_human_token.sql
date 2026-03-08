-- Function to decrement human token
create or replace function public.decrement_human_token(target_user_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  tokens_remaining integer;
begin
  -- Check if user has sufficient tokens and decrement in one query
  update public.profiles
  set human_tokens = human_tokens - 1
  where id = target_user_id and (human_tokens > 0 or human_tokens is null)
  returning human_tokens into tokens_remaining;

  -- If tokens_remaining is null, it means the update didn't happen (tokens were 0 or less, or user not found)
  if tokens_remaining is null then
    raise exception 'Insufficient human tokens';
  end if;

  return tokens_remaining;
end;
$$;
