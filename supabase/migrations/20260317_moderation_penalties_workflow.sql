do $$
begin
  if not exists (select 1 from pg_type where typname = 'moderation_sanction_type') then
    create type public.moderation_sanction_type as enum (
      'suspensao_temporaria',
      'suspensao_ate_regularizacao',
      'exclusao_com_prazo',
      'exclusao_imediata'
    );
  end if;
end
$$;

alter table public.moderation_cases
  add column if not exists sanction_type public.moderation_sanction_type null,
  add column if not exists sanction_duration_days integer null,
  add column if not exists sanction_reason_code text null,
  add column if not exists appeal_allowed boolean not null default false,
  add column if not exists appeal_deadline_at timestamptz null,
  add column if not exists workflow_stage text not null default 'recebida',
  add column if not exists interim_hidden boolean not null default false,
  add column if not exists author_response_due_at timestamptz null,
  add column if not exists correction_due_at timestamptz null,
  add column if not exists correction_attempt_count integer not null default 0,
  add column if not exists correction_attempt_limit integer not null default 3,
  add column if not exists last_author_request text null,
  add column if not exists last_author_response text null,
  add column if not exists appeal_count integer not null default 0;

alter table public.user_posts
  add column if not exists moderation_state text not null default 'public',
  add column if not exists moderation_suspend_until timestamptz null,
  add column if not exists moderation_delete_at timestamptz null,
  add column if not exists moderation_admin_note text null,
  add column if not exists moderation_last_case_id uuid null references public.moderation_cases(id) on delete set null;

alter table public.user_posts
  drop constraint if exists user_posts_moderation_state_check;

alter table public.user_posts
  add constraint user_posts_moderation_state_check
  check (
    moderation_state in (
      'public',
      'interim_suspended',
      'suspended',
      'suspended_revision',
      'revision_submitted',
      'scheduled_delete'
    )
  );

create index if not exists idx_user_posts_moderation_state
  on public.user_posts (moderation_state, created_at desc);

create or replace function public.moderation_restore_post_public(
  p_post_id uuid,
  p_case_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_posts
  set
    moderation_state = 'public',
    moderation_suspend_until = null,
    moderation_delete_at = null,
    moderation_admin_note = null,
    moderation_last_case_id = p_case_id
  where id = p_post_id;
end;
$$;

create or replace function public.moderation_update_post_visibility(
  p_post_id uuid,
  p_state text,
  p_case_id uuid,
  p_note text default null,
  p_suspend_until timestamptz default null,
  p_delete_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_posts
  set
    moderation_state = p_state,
    moderation_suspend_until = p_suspend_until,
    moderation_delete_at = p_delete_at,
    moderation_admin_note = nullif(trim(p_note), ''),
    moderation_last_case_id = p_case_id
  where id = p_post_id;
end;
$$;

create or replace function public.moderation_notify_case_reporters(
  p_case_id uuid,
  p_title text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter_id uuid;
begin
  for v_reporter_id in
    select distinct r.reporter_user_id
    from public.moderation_case_reports r
    where r.case_id = p_case_id
  loop
    perform public.moderation_insert_user_notification(
      'moderation:case:' || p_case_id::text || ':reporter:' || v_reporter_id::text || ':' || md5(coalesce(p_title, '') || ':' || coalesce(p_message, '')),
      v_reporter_id,
      p_title,
      p_message,
      '/perfil/denuncias'
    );
  end loop;
end;
$$;

create or replace function public.moderation_open_case_for_analysis(
  p_case_id uuid,
  p_admin_id uuid
)
returns public.moderation_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.moderation_cases%rowtype;
begin
  update public.moderation_cases
  set
    status = 'em_analise',
    workflow_stage = 'em_analise',
    assigned_admin_id = coalesce(assigned_admin_id, p_admin_id),
    updated_at = now()
  where id = p_case_id
  returning * into v_case;

  return v_case;
end;
$$;

create or replace function public.moderation_set_interim_post_suspension(
  p_case_id uuid,
  p_suspend boolean,
  p_note text default null
)
returns public.moderation_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_case public.moderation_cases%rowtype;
  v_title text;
  v_message text;
begin
  if v_user_id is null or not public.is_moderation_admin(v_user_id) then
    raise exception 'Acesso negado.';
  end if;

  select *
    into v_case
  from public.moderation_cases c
  where c.id = p_case_id
  for update;

  if not found then
    raise exception 'Caso não encontrado.';
  end if;

  if v_case.content_type <> 'user_post' then
    raise exception 'Suspensão preventiva disponível apenas para publicações.';
  end if;

  if v_case.status = 'finalizada' then
    raise exception 'Caso já finalizado.';
  end if;

  if v_case.status <> 'em_analise' then
    raise exception 'Inicie a análise antes de aplicar suspensão preventiva.';
  end if;

  update public.moderation_cases
  set
    interim_hidden = p_suspend,
    updated_at = now()
  where id = v_case.id
  returning * into v_case;

  if p_suspend then
    perform public.moderation_update_post_visibility(
      v_case.content_id,
      'interim_suspended',
      v_case.id,
      p_note,
      null,
      null
    );
    v_title := 'Publicação suspensa durante análise';
    v_message := coalesce(nullif(trim(p_note), ''), 'Sua publicação foi suspensa preventivamente durante a análise.');
  else
    perform public.moderation_restore_post_public(v_case.content_id, v_case.id);
    v_title := 'Suspensão preventiva removida';
    v_message := coalesce(nullif(trim(p_note), ''), 'Sua publicação voltou ao ar durante a análise.');
  end if;

  insert into public.moderation_case_events (case_id, status, note, changed_by_user_id)
  values (v_case.id, v_case.status, v_message, v_user_id);

  if v_case.content_author_user_id is not null then
    perform public.moderation_insert_user_notification(
      'moderation:case:' || v_case.id::text || ':author:interim:' || case when p_suspend then 'on' else 'off' end,
      v_case.content_author_user_id,
      v_title,
      v_message,
      '/perfil/denuncias'
    );
  end if;

  perform public.moderation_notify_case_reporters(v_case.id, v_title, v_message);

  return v_case;
end;
$$;

create or replace function public.moderation_start_author_clarification(
  p_case_id uuid,
  p_note text,
  p_due_days integer,
  p_suspend_content boolean default false
)
returns public.moderation_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_case public.moderation_cases%rowtype;
  v_due_at timestamptz;
  v_message text;
begin
  if v_user_id is null or not public.is_moderation_admin(v_user_id) then
    raise exception 'Acesso negado.';
  end if;

  if coalesce(p_due_days, 0) < 1 then
    raise exception 'Informe ao menos 1 dia para resposta do autor.';
  end if;

  select *
    into v_case
  from public.moderation_cases c
  where c.id = p_case_id
  for update;

  if not found then
    raise exception 'Caso não encontrado.';
  end if;

  if v_case.status = 'finalizada' then
    raise exception 'Caso já finalizado.';
  end if;

  if v_case.status <> 'em_analise' then
    raise exception 'Inicie a análise antes de solicitar explicação ao autor.';
  end if;

  v_due_at := now() + (p_due_days || ' days')::interval;

  update public.moderation_cases
  set
    workflow_stage = 'aguardando_autor',
    author_response_due_at = v_due_at,
    last_author_request = nullif(trim(p_note), ''),
    interim_hidden = coalesce(p_suspend_content, false),
    updated_at = now()
  where id = v_case.id
  returning * into v_case;

  if v_case.content_type = 'user_post' then
    if p_suspend_content then
      perform public.moderation_update_post_visibility(
        v_case.content_id,
        'interim_suspended',
        v_case.id,
        p_note,
        null,
        null
      );
    else
      perform public.moderation_restore_post_public(v_case.content_id, v_case.id);
    end if;
  end if;

  insert into public.moderation_case_events (case_id, status, note, changed_by_user_id)
  values (
    v_case.id,
    v_case.status,
    coalesce(nullif(trim(p_note), ''), 'Explicação solicitada ao autor.'),
    v_user_id
  );

  v_message := coalesce(nullif(trim(p_note), ''), 'A moderação precisa de uma explicação adicional do autor.');

  if v_case.content_author_user_id is not null then
    perform public.moderation_insert_user_notification(
      'moderation:case:' || v_case.id::text || ':author:clarification_requested',
      v_case.content_author_user_id,
      'Explicação solicitada pela moderação',
      v_message || ' Prazo: ' || to_char(v_due_at, 'DD/MM/YYYY HH24:MI'),
      '/perfil/denuncias'
    );
  end if;

  perform public.moderation_notify_case_reporters(
    v_case.id,
    case when p_suspend_content then 'Conteúdo suspenso durante análise' else 'Caso segue em análise' end,
    case
      when p_suspend_content then 'A moderação solicitou explicações ao autor e suspendeu o conteúdo preventivamente.'
      else 'A moderação solicitou explicações ao autor e o conteúdo segue em análise.'
    end
  );

  return v_case;
end;
$$;

create or replace function public.moderation_submit_author_response(
  p_case_id uuid,
  p_response text
)
returns public.moderation_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_case public.moderation_cases%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if nullif(trim(coalesce(p_response, '')), '') is null then
    raise exception 'Escreva uma resposta para a moderação.';
  end if;

  select *
    into v_case
  from public.moderation_cases c
  where c.id = p_case_id
  for update;

  if not found then
    raise exception 'Caso não encontrado.';
  end if;

  if v_case.content_author_user_id is distinct from v_user_id then
    raise exception 'Apenas o autor pode responder este pedido.';
  end if;

  if v_case.workflow_stage <> 'aguardando_autor' then
    raise exception 'Este caso não está aguardando resposta do autor.';
  end if;

  if v_case.author_response_due_at is not null and now() > v_case.author_response_due_at then
    raise exception 'O prazo para resposta já foi encerrado.';
  end if;

  update public.moderation_cases
  set
    workflow_stage = 'explicacao_recebida',
    last_author_response = nullif(trim(p_response), ''),
    author_response_due_at = null,
    updated_at = now()
  where id = v_case.id
  returning * into v_case;

  insert into public.moderation_case_events (case_id, status, note, changed_by_user_id)
  values (v_case.id, v_case.status, nullif(trim(p_response), ''), v_user_id);

  if v_case.assigned_admin_id is not null then
    perform public.moderation_insert_user_notification(
      'moderation:case:' || v_case.id::text || ':admin:clarification_received',
      v_case.assigned_admin_id,
      'Explicação recebida do autor',
      'O autor respondeu ao pedido de explicação e o caso voltou para análise.',
      '/admin/moderacao'
    );
  end if;

  perform public.moderation_insert_user_notification(
    'moderation:case:' || v_case.id::text || ':author:clarification_received',
    v_user_id,
    'Resposta enviada para análise',
    'Sua explicação foi enviada e será analisada pela moderação.',
    '/perfil/denuncias'
  );

  return v_case;
end;
$$;

create or replace function public.moderation_apply_revision_sanction(
  p_case_id uuid,
  p_resolution text,
  p_due_days integer,
  p_attempt_limit integer default 3
)
returns public.moderation_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_case public.moderation_cases%rowtype;
  v_due_at timestamptz;
begin
  if v_user_id is null or not public.is_moderation_admin(v_user_id) then
    raise exception 'Acesso negado.';
  end if;

  if coalesce(p_due_days, 0) < 1 then
    raise exception 'Informe ao menos 1 dia para correção.';
  end if;

  if coalesce(p_attempt_limit, 0) < 1 then
    raise exception 'Informe ao menos 1 tentativa de correção.';
  end if;

  select *
    into v_case
  from public.moderation_cases c
  where c.id = p_case_id
  for update;

  if not found then
    raise exception 'Caso não encontrado.';
  end if;

  if v_case.status = 'finalizada' then
    raise exception 'Caso já finalizado.';
  end if;

  if v_case.content_type <> 'user_post' then
    raise exception 'Fluxo de correção disponível apenas para publicações.';
  end if;

  if v_case.status <> 'em_analise' then
    raise exception 'Inicie a análise antes de solicitar correção.';
  end if;

  v_due_at := now() + (p_due_days || ' days')::interval;

  update public.moderation_cases
  set
    sanction_applied = true,
    sanction_type = 'suspensao_ate_regularizacao',
    sanction_duration_days = p_due_days,
    sanction_reason_code = null,
    resolution_summary = nullif(trim(p_resolution), ''),
    workflow_stage = 'aguardando_correcao',
    correction_due_at = v_due_at,
    correction_attempt_count = 0,
    correction_attempt_limit = p_attempt_limit,
    appeal_allowed = false,
    appeal_deadline_at = null,
    interim_hidden = true,
    updated_at = now()
  where id = v_case.id
  returning * into v_case;

  perform public.moderation_update_post_visibility(
    v_case.content_id,
    'suspended_revision',
    v_case.id,
    p_resolution,
    null,
    null
  );

  insert into public.moderation_case_events (case_id, status, note, changed_by_user_id)
  values (
    v_case.id,
    v_case.status,
    coalesce(nullif(trim(p_resolution), ''), 'Correção solicitada ao autor.'),
    v_user_id
  );

  if v_case.content_author_user_id is not null then
    perform public.moderation_insert_user_notification(
      'moderation:case:' || v_case.id::text || ':author:revision_requested',
      v_case.content_author_user_id,
      'Correção solicitada pela moderação',
      coalesce(nullif(trim(p_resolution), ''), 'Sua publicação precisa ser corrigida.') ||
        ' Prazo: ' || to_char(v_due_at, 'DD/MM/YYYY HH24:MI'),
      '/perfil/denuncias'
    );
  end if;

  perform public.moderation_notify_case_reporters(
    v_case.id,
    'Conteúdo suspenso para correção',
    'A moderação identificou problema corrigível e solicitou ajustes ao autor.'
  );

  return v_case;
end;
$$;

create or replace function public.moderation_submit_post_revision(
  p_case_id uuid,
  p_summary text default null
)
returns public.moderation_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_case public.moderation_cases%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select *
    into v_case
  from public.moderation_cases c
  where c.id = p_case_id
  for update;

  if not found then
    raise exception 'Caso não encontrado.';
  end if;

  if v_case.content_author_user_id is distinct from v_user_id then
    raise exception 'Apenas o autor pode reenviar a correção.';
  end if;

  if v_case.workflow_stage <> 'aguardando_correcao' then
    raise exception 'Este caso não está aguardando correção.';
  end if;

  if v_case.correction_due_at is not null and now() > v_case.correction_due_at then
    raise exception 'O prazo para correção foi encerrado.';
  end if;

  if v_case.correction_attempt_count >= v_case.correction_attempt_limit then
    raise exception 'O limite de tentativas de correção foi atingido.';
  end if;

  update public.moderation_cases
  set
    workflow_stage = 'correcao_recebida',
    correction_attempt_count = correction_attempt_count + 1,
    updated_at = now()
  where id = v_case.id
  returning * into v_case;

  perform public.moderation_update_post_visibility(
    v_case.content_id,
    'revision_submitted',
    v_case.id,
    p_summary,
    null,
    null
  );

  insert into public.moderation_case_events (case_id, status, note, changed_by_user_id)
  values (
    v_case.id,
    v_case.status,
    coalesce(nullif(trim(p_summary), ''), 'Correção reenviada pelo autor.'),
    v_user_id
  );

  if v_case.assigned_admin_id is not null then
    perform public.moderation_insert_user_notification(
      'moderation:case:' || v_case.id::text || ':admin:revision_submitted:' || v_case.correction_attempt_count::text,
      v_case.assigned_admin_id,
      'Correção enviada pelo autor',
      'A publicação foi corrigida e está pronta para nova análise.',
      '/admin/moderacao'
    );
  end if;

  perform public.moderation_insert_user_notification(
    'moderation:case:' || v_case.id::text || ':author:revision_submitted:' || v_case.correction_attempt_count::text,
    v_user_id,
    'Correção enviada',
    'Sua publicação corrigida foi reenviada para análise.',
    '/perfil/denuncias'
  );

  return v_case;
end;
$$;

create or replace function public.moderation_review_post_revision(
  p_case_id uuid,
  p_approve boolean,
  p_resolution text default null
)
returns public.moderation_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_case public.moderation_cases%rowtype;
  v_note text;
begin
  if v_user_id is null or not public.is_moderation_admin(v_user_id) then
    raise exception 'Acesso negado.';
  end if;

  select *
    into v_case
  from public.moderation_cases c
  where c.id = p_case_id
  for update;

  if not found then
    raise exception 'Caso não encontrado.';
  end if;

  if v_case.workflow_stage <> 'correcao_recebida' then
    raise exception 'Este caso não possui correção aguardando revisão.';
  end if;

  if p_approve then
    if nullif(trim(coalesce(p_resolution, '')), '') is null then
      raise exception 'Informe o parecer da administração antes de revisar a correção.';
    end if;

    update public.moderation_cases
    set
      status = 'finalizada',
      workflow_stage = 'encerrada',
      resolved_by_admin_id = v_user_id,
      sanction_applied = false,
      sanction_type = null,
      sanction_duration_days = null,
      sanction_reason_code = null,
      resolution_summary = coalesce(nullif(trim(p_resolution), ''), 'Correção aprovada pela moderação.'),
      appeal_allowed = false,
      appeal_deadline_at = null,
      interim_hidden = false,
      updated_at = now()
    where id = v_case.id
    returning * into v_case;

    perform public.moderation_restore_post_public(v_case.content_id, v_case.id);
    v_note := coalesce(nullif(trim(p_resolution), ''), 'Correção aprovada pela moderação.');

    if v_case.content_author_user_id is not null then
      perform public.moderation_insert_user_notification(
        'moderation:case:' || v_case.id::text || ':author:revision_approved',
        v_case.content_author_user_id,
        'Correção aprovada',
        'Sua publicação voltou a ser exibida.',
        '/perfil/denuncias'
      );
    end if;

    perform public.moderation_notify_case_reporters(
      v_case.id,
      'Publicação corrigida e restabelecida',
      'O autor corrigiu a publicação e a moderação aprovou a versão revisada.'
    );
  else
    if nullif(trim(coalesce(p_resolution, '')), '') is null then
      raise exception 'Informe o parecer da administração antes de revisar a correção.';
    end if;

    if v_case.correction_due_at is not null and now() > v_case.correction_due_at then
      raise exception 'O prazo de correção já foi encerrado.';
    end if;

    if v_case.correction_attempt_count >= v_case.correction_attempt_limit then
      raise exception 'O limite de tentativas de correção foi atingido.';
    end if;

    update public.moderation_cases
    set
      workflow_stage = 'aguardando_correcao',
      resolution_summary = coalesce(nullif(trim(p_resolution), ''), resolution_summary),
      updated_at = now()
    where id = v_case.id
    returning * into v_case;

    perform public.moderation_update_post_visibility(
      v_case.content_id,
      'suspended_revision',
      v_case.id,
      p_resolution,
      null,
      null
    );

    v_note := coalesce(nullif(trim(p_resolution), ''), 'A correção ainda precisa de ajustes.');

    if v_case.content_author_user_id is not null then
      perform public.moderation_insert_user_notification(
        'moderation:case:' || v_case.id::text || ':author:revision_rejected:' || v_case.correction_attempt_count::text,
        v_case.content_author_user_id,
        'Correção recusada pela moderação',
        v_note,
        '/perfil/denuncias'
      );
    end if;
  end if;

  insert into public.moderation_case_events (case_id, status, note, changed_by_user_id)
  values (v_case.id, v_case.status, v_note, v_user_id);

  return v_case;
end;
$$;

create or replace function public.moderation_apply_case_sanction(
  p_case_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.moderation_cases%rowtype;
begin
  select *
    into v_case
  from public.moderation_cases c
  where c.id = p_case_id
  limit 1;

  if not found or v_case.content_type <> 'user_post' then
    return;
  end if;

  if v_case.sanction_applied is distinct from true or v_case.sanction_type is null then
    return;
  end if;

  if v_case.sanction_type = 'suspensao_temporaria' then
    perform public.moderation_update_post_visibility(
      v_case.content_id,
      'suspended',
      v_case.id,
      v_case.resolution_summary,
      now() + (coalesce(nullif(v_case.sanction_duration_days, 0), 1) || ' days')::interval,
      null
    );
  elsif v_case.sanction_type = 'exclusao_com_prazo' then
    perform public.moderation_update_post_visibility(
      v_case.content_id,
      'scheduled_delete',
      v_case.id,
      v_case.resolution_summary,
      null,
      v_case.appeal_deadline_at
    );
  elsif v_case.sanction_type = 'exclusao_imediata' then
    delete from public.user_post_comments where post_id = v_case.content_id;
    delete from public.user_post_votes where post_id = v_case.content_id;
    delete from public.user_posts where id = v_case.content_id;
  end if;
end;
$$;

drop function if exists public.moderation_transition_case(uuid, text, text, boolean);

create or replace function public.moderation_transition_case(
  p_case_id uuid,
  p_next_status text,
  p_resolution text default null,
  p_apply_sanction boolean default false,
  p_sanction_type text default null,
  p_sanction_duration_days integer default null,
  p_sanction_reason_code text default null
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
  v_type public.moderation_sanction_type;
  v_deadline timestamptz;
  v_label text;
  v_preview text;
begin
  if v_user_id is null or not public.is_moderation_admin(v_user_id) then
    raise exception 'Acesso negado.';
  end if;

  v_next_status := p_next_status::public.moderation_case_status;

  select *
    into v_case
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
    v_case := public.moderation_open_case_for_analysis(v_case.id, v_user_id);
    insert into public.moderation_case_events (case_id, status, note, changed_by_user_id)
    values (v_case.id, v_case.status, 'Análise iniciada.', v_user_id);

    perform public.moderation_notify_case_reporters(
      v_case.id,
      'Denúncia em análise',
      'A moderação iniciou a análise deste conteúdo.'
    );
  elsif v_next_status = 'finalizada' then
    if v_case.status <> 'em_analise' then
      raise exception 'Inicie a análise antes de finalizar o caso.';
    end if;

    if nullif(trim(coalesce(p_resolution, '')), '') is null then
      raise exception 'Informe o parecer da administração antes de finalizar o caso.';
    end if;

    if coalesce(p_apply_sanction, false) then
      if p_sanction_type is null then
        raise exception 'Selecione um tipo de sanção.';
      end if;

      v_type := p_sanction_type::public.moderation_sanction_type;

      if v_type = 'suspensao_ate_regularizacao' then
        raise exception 'Use o fluxo de correção para suspensão até regularização.';
      end if;

      if v_type = 'exclusao_imediata'
         and nullif(trim(coalesce(p_sanction_reason_code, '')), '') is null then
        raise exception 'Informe o motivo da exclusão imediata.';
      end if;

      if v_type in ('suspensao_temporaria', 'exclusao_com_prazo')
         and coalesce(p_sanction_duration_days, 0) < 1 then
        raise exception 'Informe a duração em dias.';
      end if;

      if v_type = 'exclusao_com_prazo' and p_sanction_duration_days < 7 then
        raise exception 'O prazo mínimo para exclusão com recurso é de 7 dias.';
      end if;

      if v_type = 'exclusao_com_prazo' then
        v_deadline := now() + (p_sanction_duration_days || ' days')::interval;
      else
        v_deadline := null;
      end if;
    else
      v_type := null;
      v_deadline := null;
    end if;

    update public.moderation_cases
    set
      status = 'finalizada',
      workflow_stage = 'encerrada',
      assigned_admin_id = coalesce(assigned_admin_id, v_user_id),
      resolved_by_admin_id = v_user_id,
      sanction_applied = coalesce(p_apply_sanction, false),
      sanction_type = v_type,
      sanction_duration_days = case when coalesce(p_apply_sanction, false) then p_sanction_duration_days else null end,
      sanction_reason_code = case when coalesce(p_apply_sanction, false) then nullif(trim(p_sanction_reason_code), '') else null end,
      appeal_allowed = case when v_type = 'exclusao_com_prazo' then true else false end,
      appeal_deadline_at = v_deadline,
      resolution_summary = nullif(trim(p_resolution), ''),
      interim_hidden = false,
      author_response_due_at = null,
      correction_due_at = null,
      updated_at = now()
    where id = v_case.id
    returning * into v_case;

    insert into public.moderation_case_events (case_id, status, note, changed_by_user_id)
    values (v_case.id, v_case.status, nullif(trim(p_resolution), ''), v_user_id);

    if v_case.content_type = 'user_post' then
      if coalesce(p_apply_sanction, false) then
        perform public.moderation_apply_case_sanction(v_case.id);
      else
        perform public.moderation_restore_post_public(v_case.content_id, v_case.id);
      end if;
    end if;

    if v_case.content_author_user_id is not null
       and (
         coalesce(p_apply_sanction, false) = true
         or v_case.sanction_type is not null
         or v_case.last_author_request is not null
         or v_case.last_author_response is not null
         or v_case.interim_hidden = true
       ) then
      perform public.moderation_insert_user_notification(
        'moderation:case:' || v_case.id::text || ':author:final',
        v_case.content_author_user_id,
        case
          when coalesce(p_apply_sanction, false) = false then 'Caso finalizado sem sanção'
          when v_type = 'suspensao_temporaria' then 'Publicação suspensa temporariamente'
          when v_type = 'exclusao_com_prazo' then 'Publicação com exclusão programada'
          when v_type = 'exclusao_imediata' then 'Publicação excluída imediatamente'
          else 'Caso finalizado'
        end,
        coalesce(nullif(trim(p_resolution), ''), 'A moderação concluiu a análise deste caso.'),
        '/perfil/denuncias'
      );
    end if;

    if coalesce(p_apply_sanction, false) = false then
      v_label := 'Caso finalizado sem sanção';
      v_preview := 'A moderação concluiu que o conteúdo não violou as diretrizes.';
    else
      v_label := 'Caso finalizado com sanção';
      v_preview := coalesce(nullif(trim(p_resolution), ''), 'A moderação aplicou uma sanção ao conteúdo.');
    end if;

    perform public.moderation_notify_case_reporters(v_case.id, v_label, v_preview);
  else
    raise exception 'Transição inválida.';
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
  where c.id = p_case_id
  for update;

  if not found then
    raise exception 'Caso não encontrado.';
  end if;

  if v_case.content_author_user_id is distinct from v_user_id then
    raise exception 'Apenas o autor do conteúdo pode recorrer.';
  end if;

  if v_case.status <> 'finalizada'
     or v_case.sanction_applied = false
     or v_case.appeal_allowed = false
     or v_case.sanction_type <> 'exclusao_com_prazo' then
    raise exception 'Este caso não permite recurso.';
  end if;

  if v_case.appeal_deadline_at is not null and now() > v_case.appeal_deadline_at then
    raise exception 'O prazo para recurso já terminou.';
  end if;

  if coalesce(v_case.appeal_count, 0) >= 1 then
    raise exception 'Este caso já recebeu o recurso máximo permitido.';
  end if;

  select a.id into v_existing
  from public.moderation_appeals a
  where a.case_id = p_case_id
    and a.status in ('recurso_enviado', 'recurso_em_analise')
  limit 1;

  if v_existing is not null then
    raise exception 'Já existe recurso pendente para este caso.';
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

  update public.moderation_cases
  set
    appeal_count = coalesce(appeal_count, 0) + 1,
    updated_at = now()
  where id = v_case.id;

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

drop function if exists public.moderation_transition_appeal(uuid, text, text, boolean);

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
    if nullif(trim(coalesce(p_resolution, '')), '') is null then
      raise exception 'Informe o parecer da administração antes de concluir o recurso.';
    end if;

    update public.moderation_appeals
    set
      status = 'recurso_analisado',
      assigned_admin_id = coalesce(assigned_admin_id, v_user_id),
      resolved_by_admin_id = v_user_id,
      resolution_summary = nullif(trim(p_resolution), ''),
      updated_at = now()
    where id = p_appeal_id
    returning * into v_appeal;

    if p_keep_sanction then
      update public.moderation_cases
      set
        updated_at = now(),
        resolution_summary = coalesce(nullif(trim(p_resolution), ''), resolution_summary)
      where id = v_case.id
      returning * into v_case;
    else
      update public.moderation_cases
      set
        sanction_applied = false,
        sanction_type = null,
        sanction_duration_days = null,
        sanction_reason_code = null,
        appeal_allowed = false,
        appeal_deadline_at = null,
        resolution_summary = coalesce(nullif(trim(p_resolution), ''), 'Recurso aceito pela moderação.'),
        updated_at = now()
      where id = v_case.id
      returning * into v_case;

      if v_case.content_type = 'user_post' then
        perform public.moderation_restore_post_public(v_case.content_id, v_case.id);
      end if;
    end if;
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

create or replace function public.moderation_process_due_post_actions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.moderation_cases%rowtype;
  v_post public.user_posts%rowtype;
begin
  for v_post in
    select *
    from public.user_posts
    where moderation_state = 'suspended'
      and moderation_suspend_until is not null
      and moderation_suspend_until <= now()
  loop
    perform public.moderation_restore_post_public(v_post.id, v_post.moderation_last_case_id);
  end loop;

  for v_case in
    select *
    from public.moderation_cases
    where status <> 'finalizada'
      and workflow_stage = 'aguardando_autor'
      and author_response_due_at is not null
      and author_response_due_at <= now()
  loop
    update public.moderation_cases
    set
      workflow_stage = 'em_analise',
      author_response_due_at = null,
      updated_at = now()
    where id = v_case.id;

    insert into public.moderation_case_events (case_id, status, note, changed_by_user_id)
    values (v_case.id, v_case.status, 'Prazo de explicação do autor encerrado.', null);

    if v_case.content_author_user_id is not null then
      perform public.moderation_insert_user_notification(
        'moderation:case:' || v_case.id::text || ':author:clarification_expired',
        v_case.content_author_user_id,
        'Prazo de explicação encerrado',
        'O prazo para responder à moderação foi encerrado.',
        '/perfil/denuncias'
      );
    end if;
  end loop;

  for v_case in
    select *
    from public.moderation_cases
    where status <> 'finalizada'
      and workflow_stage = 'aguardando_correcao'
      and correction_due_at is not null
      and correction_due_at <= now()
  loop
    update public.moderation_cases
    set
      status = 'finalizada',
      workflow_stage = 'encerrada',
      resolved_by_admin_id = coalesce(resolved_by_admin_id, assigned_admin_id),
      sanction_applied = true,
      sanction_type = 'exclusao_com_prazo',
      sanction_duration_days = greatest(coalesce(sanction_duration_days, 7), 7),
      appeal_allowed = true,
      appeal_deadline_at = now() + interval '7 days',
      resolution_summary = coalesce(
        resolution_summary,
        'O prazo para correção foi encerrado sem regularização do conteúdo.'
      ),
      updated_at = now()
    where id = v_case.id
    returning * into v_case;

    perform public.moderation_apply_case_sanction(v_case.id);

    if v_case.content_author_user_id is not null then
      perform public.moderation_insert_user_notification(
        'moderation:case:' || v_case.id::text || ':author:correction_expired',
        v_case.content_author_user_id,
        'Prazo de correção encerrado',
        'A publicação entrou em exclusão com prazo por falta de regularização.',
        '/perfil/denuncias'
      );
    end if;

    perform public.moderation_notify_case_reporters(
      v_case.id,
      'Prazo de correção encerrado',
      'O autor não regularizou o conteúdo dentro do prazo definido pela moderação.'
    );
  end loop;

  for v_post in
    select *
    from public.user_posts
    where moderation_state = 'scheduled_delete'
      and moderation_delete_at is not null
      and moderation_delete_at <= now()
  loop
    if not exists (
      select 1
      from public.moderation_appeals a
      where a.case_id = v_post.moderation_last_case_id
        and a.status in ('recurso_enviado', 'recurso_em_analise')
    ) then
      delete from public.user_post_comments where post_id = v_post.id;
      delete from public.user_post_votes where post_id = v_post.id;
      delete from public.user_posts where id = v_post.id;
    end if;
  end loop;
end;
$$;

grant execute on function public.moderation_set_interim_post_suspension(uuid, boolean, text) to authenticated;
grant execute on function public.moderation_start_author_clarification(uuid, text, integer, boolean) to authenticated;
grant execute on function public.moderation_submit_author_response(uuid, text) to authenticated;
grant execute on function public.moderation_apply_revision_sanction(uuid, text, integer, integer) to authenticated;
grant execute on function public.moderation_submit_post_revision(uuid, text) to authenticated;
grant execute on function public.moderation_review_post_revision(uuid, boolean, text) to authenticated;
grant execute on function public.moderation_apply_case_sanction(uuid) to authenticated;
grant execute on function public.moderation_transition_case(uuid, text, text, boolean, text, integer, text) to authenticated;
grant execute on function public.moderation_submit_appeal(uuid, text) to authenticated;
grant execute on function public.moderation_transition_appeal(uuid, text, text, boolean) to authenticated;
grant execute on function public.moderation_process_due_post_actions() to authenticated;

notify pgrst, 'reload schema';
