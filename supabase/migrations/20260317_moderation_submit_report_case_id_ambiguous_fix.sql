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

  select count(*)::integer, count(distinct r.reporter_user_id)::integer
    into v_total, v_unique
  from public.moderation_case_reports r
  where r.case_id = v_case_id;

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
