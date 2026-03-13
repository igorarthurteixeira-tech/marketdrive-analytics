create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'moderation_content_type') then
    create type public.moderation_content_type as enum (
      'user_post',
      'user_post_comment',
      'vehicle_comment',
      'positive',
      'defect'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'moderation_reason') then
    create type public.moderation_reason as enum (
      'spam',
      'ofensa',
      'assedio',
      'desinformacao',
      'conteudo_ilegal',
      'odio_discriminacao',
      'violencia_ameaca',
      'outro'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'moderation_case_status') then
    create type public.moderation_case_status as enum (
      'enviada',
      'em_analise',
      'finalizada'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'moderation_appeal_status') then
    create type public.moderation_appeal_status as enum (
      'recurso_enviado',
      'recurso_em_analise',
      'recurso_analisado'
    );
  end if;
end $$;

create table if not exists public.moderation_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_by uuid null references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  content_type public.moderation_content_type not null,
  content_id uuid not null,
  content_author_user_id uuid null references public.profiles(id) on delete set null,
  content_href text not null default '/feed',
  content_preview text not null default '',
  reason public.moderation_reason not null,
  status public.moderation_case_status not null default 'enviada',
  priority_score integer not null default 0,
  total_reports integer not null default 0,
  unique_reporters integer not null default 0,
  first_reported_at timestamptz not null default now(),
  latest_reported_at timestamptz not null default now(),
  opened_by_user_id uuid null references public.profiles(id) on delete set null,
  assigned_admin_id uuid null references public.profiles(id) on delete set null,
  resolved_by_admin_id uuid null references public.profiles(id) on delete set null,
  sanction_applied boolean not null default false,
  resolution_summary text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_moderation_cases_status_priority
  on public.moderation_cases(status, priority_score desc, latest_reported_at desc);

create index if not exists idx_moderation_cases_author
  on public.moderation_cases(content_author_user_id, created_at desc);

create unique index if not exists uq_moderation_cases_open
  on public.moderation_cases(content_type, content_id, reason)
  where status in ('enviada', 'em_analise');

create table if not exists public.moderation_case_reports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  details text null,
  created_at timestamptz not null default now(),
  unique(case_id, reporter_user_id)
);

create index if not exists idx_moderation_case_reports_case
  on public.moderation_case_reports(case_id, created_at desc);

create index if not exists idx_moderation_case_reports_reporter
  on public.moderation_case_reports(reporter_user_id, created_at desc);

create table if not exists public.moderation_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  status public.moderation_case_status not null,
  note text null,
  changed_by_user_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_moderation_case_events_case
  on public.moderation_case_events(case_id, created_at desc);

create table if not exists public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.moderation_cases(id) on delete cascade,
  appellant_user_id uuid not null references public.profiles(id) on delete cascade,
  status public.moderation_appeal_status not null default 'recurso_enviado',
  assigned_admin_id uuid null references public.profiles(id) on delete set null,
  resolved_by_admin_id uuid null references public.profiles(id) on delete set null,
  summary text null,
  resolution_summary text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_moderation_appeals_status
  on public.moderation_appeals(status, updated_at desc);

create table if not exists public.moderation_appeal_events (
  id uuid primary key default gen_random_uuid(),
  appeal_id uuid not null references public.moderation_appeals(id) on delete cascade,
  status public.moderation_appeal_status not null,
  note text null,
  changed_by_user_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_moderation_appeal_events_appeal
  on public.moderation_appeal_events(appeal_id, created_at desc);

create or replace function public.touch_updated_at_moderation_admins()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_updated_at_moderation_admins on public.moderation_admins;
create trigger trg_touch_updated_at_moderation_admins
before update on public.moderation_admins
for each row
execute function public.touch_updated_at_moderation_admins();

create or replace function public.touch_updated_at_moderation_cases()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_updated_at_moderation_cases on public.moderation_cases;
create trigger trg_touch_updated_at_moderation_cases
before update on public.moderation_cases
for each row
execute function public.touch_updated_at_moderation_cases();

create or replace function public.touch_updated_at_moderation_appeals()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_updated_at_moderation_appeals on public.moderation_appeals;
create trigger trg_touch_updated_at_moderation_appeals
before update on public.moderation_appeals
for each row
execute function public.touch_updated_at_moderation_appeals();

create or replace function public.is_moderation_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.moderation_admins ma
    where ma.user_id = p_user_id
      and ma.is_active = true
  );
$$;

create or replace function public.moderation_reason_label(p_reason public.moderation_reason)
returns text
language sql
immutable
as $$
  select case p_reason
    when 'spam' then 'Spam'
    when 'ofensa' then 'Ofensa'
    when 'assedio' then 'Assédio'
    when 'desinformacao' then 'Desinformação'
    when 'conteudo_ilegal' then 'Conteúdo ilegal'
    when 'odio_discriminacao' then 'Ódio ou discriminação'
    when 'violencia_ameaca' then 'Violência ou ameaça'
    else 'Outro'
  end;
$$;

create or replace function public.moderation_get_content_author(
  p_content_type public.moderation_content_type,
  p_content_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  case p_content_type
    when 'user_post' then
      select up.author_user_id into v_author from public.user_posts up where up.id = p_content_id;
    when 'user_post_comment' then
      select c.user_id into v_author from public.user_post_comments c where c.id = p_content_id;
    when 'vehicle_comment' then
      select c.created_by into v_author from public.vehicle_comments c where c.id = p_content_id;
    when 'positive' then
      select p.created_by into v_author from public.positives p where p.id = p_content_id;
    when 'defect' then
      select d.created_by into v_author from public.defects d where d.id = p_content_id;
  end case;
  return v_author;
end;
$$;

create or replace function public.moderation_get_content_href(
  p_content_type public.moderation_content_type,
  p_content_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_href text := '/feed';
  v_defect_type text;
begin
  case p_content_type
    when 'user_post' then
      v_href := '/feed';
    when 'user_post_comment' then
      v_href := '/feed';
    when 'vehicle_comment' then
      select vv.slug
        into v_slug
      from public.vehicle_comments c
      join public.vehicle_versions vv on vv.id = c.vehicle_version_id
      where c.id = p_content_id
      limit 1;
      if v_slug is not null then
        v_href := '/carros/' || v_slug || '#comentarios';
      end if;
    when 'positive' then
      select vv.slug
        into v_slug
      from public.positives p
      join public.vehicle_versions vv on vv.id = p.vehicle_version_id
      where p.id = p_content_id
      limit 1;
      if v_slug is not null then
        v_href := '/carros/' || v_slug || '#positivos';
      end if;
    when 'defect' then
      select vv.slug, d.defect_type
        into v_slug, v_defect_type
      from public.defects d
      join public.vehicle_versions vv on vv.id = d.vehicle_version_id
      where d.id = p_content_id
      limit 1;
      if v_slug is not null then
        if coalesce(v_defect_type, '') = 'crônico' then
          v_href := '/carros/' || v_slug || '#defeitos-cronicos';
        else
          v_href := '/carros/' || v_slug || '#defeitos-pontuais';
        end if;
      end if;
  end case;

  return v_href;
end;
$$;

create or replace function public.moderation_get_content_preview(
  p_content_type public.moderation_content_type,
  p_content_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_preview text := '';
begin
  case p_content_type
    when 'user_post' then
      select left(coalesce(up.title || ' - ', '') || coalesce(up.description, ''), 220)
        into v_preview
      from public.user_posts up
      where up.id = p_content_id;
    when 'user_post_comment' then
      select left(coalesce(c.content, ''), 220)
        into v_preview
      from public.user_post_comments c
      where c.id = p_content_id;
    when 'vehicle_comment' then
      select left(coalesce(c.content, ''), 220)
        into v_preview
      from public.vehicle_comments c
      where c.id = p_content_id;
    when 'positive' then
      select left(coalesce(p.content, ''), 220)
        into v_preview
      from public.positives p
      where p.id = p_content_id;
    when 'defect' then
      select left(coalesce(d.content, ''), 220)
        into v_preview
      from public.defects d
      where d.id = p_content_id;
  end case;
  return coalesce(v_preview, '');
end;
$$;

create or replace function public.moderation_calculate_priority(
  p_reason public.moderation_reason,
  p_unique_reporters integer,
  p_total_reports integer
)
returns integer
language sql
immutable
as $$
  select (
    case p_reason
      when 'violencia_ameaca' then 80
      when 'conteudo_ilegal' then 70
      when 'odio_discriminacao' then 65
      when 'assedio' then 55
      when 'desinformacao' then 45
      when 'ofensa' then 35
      when 'spam' then 25
      else 15
    end
  ) + (greatest(p_unique_reporters, 0) * 4) + greatest(p_total_reports, 0);
$$;

create or replace function public.moderation_user_reported_case(
  p_case_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.moderation_case_reports r
    where r.case_id = p_case_id
      and r.reporter_user_id = p_user_id
  );
$$;

create or replace function public.moderation_user_is_case_author(
  p_case_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.moderation_cases c
    where c.id = p_case_id
      and c.content_author_user_id = p_user_id
  );
$$;

create or replace function public.moderation_user_case_visible(
  p_case_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.moderation_cases c
    where c.id = p_case_id
      and (
        c.opened_by_user_id = p_user_id
        or c.content_author_user_id = p_user_id
        or public.moderation_user_reported_case(c.id, p_user_id)
      )
  );
$$;

create or replace function public.moderation_insert_user_notification(
  p_notification_id text,
  p_recipient_user_id uuid,
  p_label text,
  p_preview text,
  p_href text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.user_notifications') is null then
    return;
  end if;

  insert into public.user_notifications (
    id,
    recipient_user_id,
    actor_user_id,
    label,
    preview,
    href,
    actor_name,
    actor_avatar_url,
    vehicle_image_url,
    is_read
  ) values (
    p_notification_id,
    p_recipient_user_id,
    null,
    p_label,
    left(coalesce(p_preview, ''), 300),
    coalesce(p_href, '/'),
    'Administração MarketDrive',
    null,
    null,
    false
  )
  on conflict (id)
  do update set
    recipient_user_id = excluded.recipient_user_id,
    label = excluded.label,
    preview = excluded.preview,
    href = excluded.href,
    actor_name = excluded.actor_name,
    actor_avatar_url = excluded.actor_avatar_url,
    vehicle_image_url = excluded.vehicle_image_url,
    is_read = false,
    updated_at = now();
end;
$$;

create or replace function public.moderation_submit_report(
  p_content_type text,
  p_content_id uuid,
  p_reason text,
  p_details text default null
)
returns table (
  case_id uuid,
  case_status text,
  grouped boolean,
  already_reported boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_content_type public.moderation_content_type;
  v_reason public.moderation_reason;
  v_case_id uuid;
  v_report_id uuid;
  v_author_id uuid;
  v_total integer;
  v_unique integer;
  v_is_grouped boolean := false;
  v_already_reported boolean := false;
  v_href text;
  v_preview text;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  v_content_type := p_content_type::public.moderation_content_type;
  v_reason := p_reason::public.moderation_reason;

  v_author_id := public.moderation_get_content_author(v_content_type, p_content_id);
  if v_author_id is null then
    raise exception 'Conteúdo não encontrado para denúncia.';
  end if;

  if v_author_id = v_user_id then
    raise exception 'Você não pode denunciar seu próprio conteúdo.';
  end if;

  select c.id
    into v_case_id
  from public.moderation_cases c
  where c.content_type = v_content_type
    and c.content_id = p_content_id
    and c.reason = v_reason
    and c.status in ('enviada', 'em_analise')
  order by c.created_at desc
  limit 1
  for update;

  if v_case_id is null then
    v_href := public.moderation_get_content_href(v_content_type, p_content_id);
    v_preview := public.moderation_get_content_preview(v_content_type, p_content_id);

    insert into public.moderation_cases (
      content_type,
      content_id,
      content_author_user_id,
      content_href,
      content_preview,
      reason,
      status,
      opened_by_user_id,
      first_reported_at,
      latest_reported_at
    ) values (
      v_content_type,
      p_content_id,
      v_author_id,
      coalesce(v_href, '/'),
      coalesce(v_preview, ''),
      v_reason,
      'enviada',
      v_user_id,
      now(),
      now()
    )
    returning id into v_case_id;

    insert into public.moderation_case_events (case_id, status, note, changed_by_user_id)
    values (v_case_id, 'enviada', 'Caso aberto', v_user_id);
  else
    v_is_grouped := true;
  end if;

  insert into public.moderation_case_reports (case_id, reporter_user_id, details)
  values (v_case_id, v_user_id, nullif(trim(p_details), ''))
  on conflict (case_id, reporter_user_id) do nothing
  returning id into v_report_id;

  v_already_reported := v_report_id is null;

  select count(*)::integer, count(distinct reporter_user_id)::integer
    into v_total, v_unique
  from public.moderation_case_reports
  where case_id = v_case_id;

  update public.moderation_cases c
  set
    total_reports = coalesce(v_total, 0),
    unique_reporters = coalesce(v_unique, 0),
    latest_reported_at = now(),
    priority_score = public.moderation_calculate_priority(c.reason, coalesce(v_unique, 0), coalesce(v_total, 0)),
    updated_at = now()
  where c.id = v_case_id;

  perform public.moderation_insert_user_notification(
    'moderation:case:' || v_case_id::text || ':reporter:' || v_user_id::text || ':enviada',
    v_user_id,
    'Denúncia enviada',
    'Motivo: ' || public.moderation_reason_label(v_reason),
    '/perfil/denuncias'
  );

  return query
  select c.id, c.status::text, v_is_grouped, v_already_reported
  from public.moderation_cases c
  where c.id = v_case_id;
end;
$$;

create or replace function public.moderation_transition_case(
  p_case_id uuid,
  p_next_status text,
  p_resolution text default null,
  p_apply_sanction boolean default false
)
returns public.moderation_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_next_status public.moderation_case_status;
  v_case public.moderation_cases%rowtype;
  v_reporter_id uuid;
  v_label text;
  v_preview text;
begin
  if v_user_id is null or not public.is_moderation_admin(v_user_id) then
    raise exception 'Acesso negado.';
  end if;

  v_next_status := p_next_status::public.moderation_case_status;

  select * into v_case
  from public.moderation_cases c
  where c.id = p_case_id
  for update;

  if not found then
    raise exception 'Caso não encontrado.';
  end if;

  if v_case.status = 'finalizada' then
    raise exception 'Caso já finalizado.';
  end if;

  if v_next_status = 'em_analise' then
    update public.moderation_cases
    set
      status = 'em_analise',
      assigned_admin_id = coalesce(assigned_admin_id, v_user_id),
      updated_at = now()
    where id = p_case_id
    returning * into v_case;
  elsif v_next_status = 'finalizada' then
    update public.moderation_cases
    set
      status = 'finalizada',
      assigned_admin_id = coalesce(assigned_admin_id, v_user_id),
      resolved_by_admin_id = v_user_id,
      sanction_applied = coalesce(p_apply_sanction, false),
      resolution_summary = nullif(trim(p_resolution), ''),
      updated_at = now()
    where id = p_case_id
    returning * into v_case;
  else
    raise exception 'Transição inválida.';
  end if;

  insert into public.moderation_case_events (case_id, status, note, changed_by_user_id)
  values (v_case.id, v_case.status, nullif(trim(p_resolution), ''), v_user_id);

  if v_case.status = 'em_analise' then
    v_label := 'Denúncia em análise';
    v_preview := 'Seu caso está em análise pela administração.';
  else
    v_label := 'Denúncia finalizada';
    v_preview := coalesce(nullif(trim(v_case.resolution_summary), ''), 'Caso finalizado pela administração.');
  end if;

  for v_reporter_id in
    select distinct r.reporter_user_id
    from public.moderation_case_reports r
    where r.case_id = v_case.id
  loop
    perform public.moderation_insert_user_notification(
      'moderation:case:' || v_case.id::text || ':reporter:' || v_reporter_id::text || ':' || v_case.status::text,
      v_reporter_id,
      v_label,
      v_preview,
      '/perfil/denuncias'
    );
  end loop;

  if v_case.status = 'finalizada' and v_case.sanction_applied = true and v_case.content_author_user_id is not null then
    perform public.moderation_insert_user_notification(
      'moderation:case:' || v_case.id::text || ':author:sancao',
      v_case.content_author_user_id,
      'Conteúdo sancionado pela administração',
      coalesce(nullif(trim(v_case.resolution_summary), ''), 'Você pode recorrer desta decisão no painel de denúncias.'),
      '/perfil/denuncias'
    );
  end if;

  return v_case;
end;
$$;

create or replace function public.moderation_submit_appeal(
  p_case_id uuid,
  p_summary text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_case public.moderation_cases%rowtype;
  v_existing uuid;
  v_appeal_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select *
    into v_case
  from public.moderation_cases c
  where c.id = p_case_id;

  if not found then
    raise exception 'Caso não encontrado.';
  end if;

  if v_case.content_author_user_id is distinct from v_user_id then
    raise exception 'Apenas o autor do conteúdo pode recorrer.';
  end if;

  if v_case.status <> 'finalizada' or v_case.sanction_applied = false then
    raise exception 'Este caso não permite recurso.';
  end if;

  select a.id into v_existing
  from public.moderation_appeals a
  where a.case_id = p_case_id
  limit 1;

  if v_existing is not null then
    raise exception 'Já existe recurso para este caso.';
  end if;

  insert into public.moderation_appeals (
    case_id,
    appellant_user_id,
    status,
    summary
  ) values (
    p_case_id,
    v_user_id,
    'recurso_enviado',
    nullif(trim(p_summary), '')
  )
  returning id into v_appeal_id;

  insert into public.moderation_appeal_events (appeal_id, status, note, changed_by_user_id)
  values (v_appeal_id, 'recurso_enviado', nullif(trim(p_summary), ''), v_user_id);

  perform public.moderation_insert_user_notification(
    'moderation:appeal:' || v_appeal_id::text || ':appellant:recurso_enviado',
    v_user_id,
    'Recurso enviado',
    'Seu recurso foi registrado e será analisado por outro administrador.',
    '/perfil/denuncias'
  );

  return v_appeal_id;
end;
$$;

create or replace function public.moderation_transition_appeal(
  p_appeal_id uuid,
  p_next_status text,
  p_resolution text default null,
  p_keep_sanction boolean default true
)
returns public.moderation_appeals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_next_status public.moderation_appeal_status;
  v_appeal public.moderation_appeals%rowtype;
  v_case public.moderation_cases%rowtype;
begin
  if v_user_id is null or not public.is_moderation_admin(v_user_id) then
    raise exception 'Acesso negado.';
  end if;

  v_next_status := p_next_status::public.moderation_appeal_status;

  select * into v_appeal
  from public.moderation_appeals a
  where a.id = p_appeal_id
  for update;

  if not found then
    raise exception 'Recurso não encontrado.';
  end if;

  select * into v_case
  from public.moderation_cases c
  where c.id = v_appeal.case_id
  for update;

  if not found then
    raise exception 'Caso relacionado não encontrado.';
  end if;

  if v_case.resolved_by_admin_id = v_user_id then
    raise exception 'O mesmo administrador não pode julgar o recurso.';
  end if;

  if v_appeal.status = 'recurso_analisado' then
    raise exception 'Recurso já analisado.';
  end if;

  if v_next_status = 'recurso_em_analise' then
    update public.moderation_appeals
    set
      status = 'recurso_em_analise',
      assigned_admin_id = coalesce(assigned_admin_id, v_user_id),
      updated_at = now()
    where id = p_appeal_id
    returning * into v_appeal;
  elsif v_next_status = 'recurso_analisado' then
    update public.moderation_appeals
    set
      status = 'recurso_analisado',
      assigned_admin_id = coalesce(assigned_admin_id, v_user_id),
      resolved_by_admin_id = v_user_id,
      resolution_summary = nullif(trim(p_resolution), ''),
      updated_at = now()
    where id = p_appeal_id
    returning * into v_appeal;

    update public.moderation_cases
    set
      sanction_applied = coalesce(p_keep_sanction, true),
      updated_at = now()
    where id = v_case.id;
  else
    raise exception 'Transição de recurso inválida.';
  end if;

  insert into public.moderation_appeal_events (appeal_id, status, note, changed_by_user_id)
  values (v_appeal.id, v_appeal.status, nullif(trim(p_resolution), ''), v_user_id);

  perform public.moderation_insert_user_notification(
    'moderation:appeal:' || v_appeal.id::text || ':appellant:' || v_appeal.status::text,
    v_appeal.appellant_user_id,
    case
      when v_appeal.status = 'recurso_em_analise' then 'Recurso em análise'
      else 'Recurso analisado'
    end,
    case
      when v_appeal.status = 'recurso_em_analise' then 'Seu recurso está em análise.'
      else coalesce(nullif(trim(v_appeal.resolution_summary), ''), 'Seu recurso foi analisado pela administração.')
    end,
    '/perfil/denuncias'
  );

  return v_appeal;
end;
$$;

alter table public.moderation_admins enable row level security;
alter table public.moderation_cases enable row level security;
alter table public.moderation_case_reports enable row level security;
alter table public.moderation_case_events enable row level security;
alter table public.moderation_appeals enable row level security;
alter table public.moderation_appeal_events enable row level security;

drop policy if exists "moderation_admins_select" on public.moderation_admins;
create policy "moderation_admins_select"
on public.moderation_admins
for select
to authenticated
using (true);

drop policy if exists "moderation_cases_select_visible" on public.moderation_cases;
create policy "moderation_cases_select_visible"
on public.moderation_cases
for select
to authenticated
using (
  public.is_moderation_admin(auth.uid())
  or opened_by_user_id = auth.uid()
  or content_author_user_id = auth.uid()
  or public.moderation_user_reported_case(id, auth.uid())
);

drop policy if exists "moderation_case_reports_select_visible" on public.moderation_case_reports;
create policy "moderation_case_reports_select_visible"
on public.moderation_case_reports
for select
to authenticated
using (
  reporter_user_id = auth.uid()
  or public.is_moderation_admin(auth.uid())
  or public.moderation_user_is_case_author(case_id, auth.uid())
);

drop policy if exists "moderation_case_events_select_visible" on public.moderation_case_events;
create policy "moderation_case_events_select_visible"
on public.moderation_case_events
for select
to authenticated
using (
  public.is_moderation_admin(auth.uid())
  or public.moderation_user_case_visible(case_id, auth.uid())
);

drop policy if exists "moderation_appeals_select_visible" on public.moderation_appeals;
create policy "moderation_appeals_select_visible"
on public.moderation_appeals
for select
to authenticated
using (
  appellant_user_id = auth.uid()
  or public.is_moderation_admin(auth.uid())
);

drop policy if exists "moderation_appeal_events_select_visible" on public.moderation_appeal_events;
create policy "moderation_appeal_events_select_visible"
on public.moderation_appeal_events
for select
to authenticated
using (
  public.is_moderation_admin(auth.uid())
  or exists (
    select 1
    from public.moderation_appeals a
    where a.id = moderation_appeal_events.appeal_id
      and a.appellant_user_id = auth.uid()
  )
);

grant execute on function public.is_moderation_admin(uuid) to authenticated;
grant execute on function public.moderation_user_reported_case(uuid, uuid) to authenticated;
grant execute on function public.moderation_user_is_case_author(uuid, uuid) to authenticated;
grant execute on function public.moderation_user_case_visible(uuid, uuid) to authenticated;
grant execute on function public.moderation_submit_report(text, uuid, text, text) to authenticated;
grant execute on function public.moderation_transition_case(uuid, text, text, boolean) to authenticated;
grant execute on function public.moderation_submit_appeal(uuid, text) to authenticated;
grant execute on function public.moderation_transition_appeal(uuid, text, text, boolean) to authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'moderation_cases'
  ) THEN
    execute 'alter publication supabase_realtime add table public.moderation_cases';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'moderation_appeals'
  ) THEN
    execute 'alter publication supabase_realtime add table public.moderation_appeals';
  END IF;
END $$;
