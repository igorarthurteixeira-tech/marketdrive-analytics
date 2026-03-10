-- Notificações automáticas para pedidos de pontos (positivo/defeito)
-- Fluxo coberto:
-- 1) criação de pedido pendente -> notifica dono do veículo
-- 2) revisão (approved/rejected) -> notifica solicitante

create or replace function public.notify_vehicle_point_suggestion_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_image text;
  v_href text;
  requester_name text;
  requester_avatar text;
  owner_name text;
  owner_avatar text;
  owner_label text;
  requester_result_label text;
begin
  if to_regclass('public.user_notifications') is null then
    return coalesce(new, old);
  end if;

  select vv.slug, vv.image_url
    into v_slug, v_image
  from public.vehicle_versions vv
  where vv.id = coalesce(new.vehicle_version_id, old.vehicle_version_id)
  limit 1;

  v_href := case
    when v_slug is null then '/carros'
    when coalesce(new.point_type, old.point_type) = 'positive' then '/carros/' || v_slug || '#positivos'
    when coalesce(new.point_type, old.point_type) = 'defect_pontual' then '/carros/' || v_slug || '#defeitos-pontuais'
    when coalesce(new.point_type, old.point_type) = 'defect_chronic' then '/carros/' || v_slug || '#defeitos-cronicos'
    else '/carros/' || v_slug
  end;

  select coalesce(nullif(trim(p.name), ''), nullif(trim(p.username), ''), 'Usuário'), p.avatar_url
    into requester_name, requester_avatar
  from public.profiles p
  where p.id = coalesce(new.requester_user_id, old.requester_user_id)
  limit 1;

  select coalesce(nullif(trim(p.name), ''), nullif(trim(p.username), ''), 'Autor do veículo'), p.avatar_url
    into owner_name, owner_avatar
  from public.profiles p
  where p.id = coalesce(new.owner_user_id, old.owner_user_id)
  limit 1;

  if tg_op = 'INSERT' then
    if new.status = 'pending' and new.owner_user_id is not null and new.requester_user_id is distinct from new.owner_user_id then
      owner_label := case
        when new.point_type = 'positive' then 'Nova sugestão de ponto positivo'
        when new.point_type = 'defect_pontual' then 'Nova sugestão de defeito pontual'
        when new.point_type = 'defect_chronic' then 'Nova sugestão de defeito crônico'
        else 'Nova sugestão recebida'
      end;

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
        'point-suggestion:' || new.id::text || ':owner',
        new.owner_user_id,
        new.requester_user_id,
        owner_label,
        left(coalesce(new.content, ''), 300),
        v_href,
        coalesce(requester_name, 'Usuário'),
        requester_avatar,
        v_image,
        false
      )
      on conflict (id)
      do update set
        recipient_user_id = excluded.recipient_user_id,
        actor_user_id = excluded.actor_user_id,
        label = excluded.label,
        preview = excluded.preview,
        href = excluded.href,
        actor_name = excluded.actor_name,
        actor_avatar_url = excluded.actor_avatar_url,
        vehicle_image_url = excluded.vehicle_image_url,
        is_read = false,
        updated_at = now();
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status is distinct from new.status and new.status in ('approved', 'rejected') and new.requester_user_id is not null then
      requester_result_label := case
        when new.point_type = 'positive' and new.status = 'approved' then 'Seu pedido de ponto positivo foi aceito'
        when new.point_type = 'positive' and new.status = 'rejected' then 'Seu pedido de ponto positivo foi negado'
        when new.point_type in ('defect_pontual', 'defect_chronic') and new.status = 'approved' then 'Seu pedido de defeito foi aceito'
        when new.point_type in ('defect_pontual', 'defect_chronic') and new.status = 'rejected' then 'Seu pedido de defeito foi negado'
        else 'Seu pedido foi atualizado'
      end;

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
        'point-suggestion:' || new.id::text || ':requester:' || new.status,
        new.requester_user_id,
        coalesce(new.reviewed_by, new.owner_user_id),
        requester_result_label,
        left(coalesce(new.content, ''), 300),
        v_href,
        coalesce(owner_name, 'Autor do veículo'),
        owner_avatar,
        v_image,
        false
      )
      on conflict (id)
      do update set
        recipient_user_id = excluded.recipient_user_id,
        actor_user_id = excluded.actor_user_id,
        label = excluded.label,
        preview = excluded.preview,
        href = excluded.href,
        actor_name = excluded.actor_name,
        actor_avatar_url = excluded.actor_avatar_url,
        vehicle_image_url = excluded.vehicle_image_url,
        is_read = false,
        updated_at = now();
    end if;

    return new;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_notify_vehicle_point_suggestion_events on public.vehicle_point_suggestions;

create trigger trg_notify_vehicle_point_suggestion_events
after insert or update of status, reviewed_by, reviewed_at
on public.vehicle_point_suggestions
for each row
execute function public.notify_vehicle_point_suggestion_events();

-- Garante realtime para user_notifications
DO $$
BEGIN
  IF to_regclass('public.user_notifications') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'user_notifications'
     ) THEN
    execute 'alter publication supabase_realtime add table public.user_notifications';
  END IF;
END $$;
