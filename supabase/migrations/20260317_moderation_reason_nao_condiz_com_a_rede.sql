do $$
begin
  if exists (select 1 from pg_type where typname = 'moderation_reason') then
    alter type public.moderation_reason add value if not exists 'nao_condiz_com_a_rede';
  end if;
end
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
    when 'nao_condiz_com_a_rede' then 'Não condiz com a rede'
    else 'Outro'
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
      when 'nao_condiz_com_a_rede' then 30
      when 'spam' then 25
      else 15
    end
  ) + (greatest(p_unique_reporters, 0) * 4) + greatest(p_total_reports, 0);
$$;
