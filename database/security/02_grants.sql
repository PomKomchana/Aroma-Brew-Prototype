-- 02 who may call which function
-- On Supabase every function in "public" can be executed with the anon key unless it is
-- revoked. The app only needs the functions it calls itself, so the helpers below are closed.
-- (Other security-definer functions can still call them: they run as the owner.)

-- internal helpers - none of these is called from the frontend.
-- assert_role returns the whole employee row (including password_hash) and take_stock_offline
-- changes stock, so they must not be callable from the browser.
revoke execute on function assert_role(int, text[])                                   from public, anon, authenticated;
revoke execute on function log_audit(int, text, text, int, text, text)                from public, anon, authenticated;
revoke execute on function ingredient_unit_cost(int)                                  from public, anon, authenticated;
revoke execute on function to_local(timestamp)                                        from public, anon, authenticated;
revoke execute on function take_stock_offline(int, int, numeric, int, int, timestamp) from public, anon, authenticated;

-- pre-order helpers (they would reveal other customers' orders)
revoke execute on function preorder_cfg(int)              from public, anon, authenticated;
revoke execute on function preorder_slots(int)            from public, anon, authenticated;
revoke execute on function preorder_needs()               from public, anon, authenticated;
revoke execute on function best_promotion(numeric)        from public, anon, authenticated;
revoke execute on function preorder_json(int, boolean)    from public, anon, authenticated;
revoke execute on function member_phone(uuid)             from public, anon, authenticated;

-- customer site (public) functions
grant execute on function get_branches()                                  to anon, authenticated;
grant execute on function get_pickup_slots()                              to anon, authenticated;
grant execute on function place_preorder(uuid, timestamptz, jsonb, text)  to anon, authenticated;
grant execute on function get_my_preorders(uuid)                          to anon, authenticated;
grant execute on function get_my_preorder(uuid, int)                      to anon, authenticated;
grant execute on function cancel_my_preorder(uuid, int)                   to anon, authenticated;

-- staff pre-order functions
grant execute on function get_preorders(int, text)                                                  to anon, authenticated;
grant execute on function get_preorder_counts(int)                                                  to anon, authenticated;
grant execute on function set_preorder_status(int, int, text, text)                                 to anon, authenticated;
grant execute on function complete_preorder(int, int, int, varchar)                                 to anon, authenticated;
grant execute on function get_preorder_settings(int)                                                to anon, authenticated;
grant execute on function update_preorder_settings(int, boolean, time, time, int, int, int, int)    to anon, authenticated;
