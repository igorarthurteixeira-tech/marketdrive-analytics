alter table public.vehicle_comments
  add column if not exists parent_comment_id uuid null references public.vehicle_comments(id) on delete set null,
  add column if not exists reply_to_user_id uuid null references auth.users(id) on delete set null;

create index if not exists idx_vehicle_comments_parent_comment_id
  on public.vehicle_comments(parent_comment_id);

create index if not exists idx_vehicle_comments_reply_to_user_id
  on public.vehicle_comments(reply_to_user_id);
