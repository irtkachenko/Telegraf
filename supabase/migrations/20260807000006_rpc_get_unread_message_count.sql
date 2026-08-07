-- Single-query RPC to compute the total unread message count for the current user.
-- Replaces the N+1 client-side loop in useBadgeSync (getExactUnreadMessageCount)
-- which fired one REST query per chat + one per last_read lookup.

create or replace function public.rpc_get_unread_message_count()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_total bigint;
begin
    if v_user_id is null then
        return 0;
    end if;

    select coalesce(sum(cnt), 0)
    into v_total
    from (
        select count(*) as cnt
        from public.chats c
        join public.messages m on m.chat_id = c.id
        left join public.messages read_msg on read_msg.id = case
            when c.user_id = v_user_id then c.user_last_read_id
            else c.recipient_last_read_id
        end
        where (c.user_id = v_user_id or c.recipient_id = v_user_id)
          and m.sender_id <> v_user_id
          and (read_msg.id is null or m.created_at > read_msg.created_at)
    ) sub;

    return v_total;
end;
$$;

grant execute on function public.rpc_get_unread_message_count() to authenticated;
grant execute on function public.rpc_get_unread_message_count() to service_role;