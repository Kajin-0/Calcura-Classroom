-- Rollback-only synthetic fixtures. No production identities or Stripe calls.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

select extensions.ok(not exists (
  select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
), 'every exposed application table has RLS');
select extensions.ok(not exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','classroom_private') and p.prosecdef
    and not coalesce('search_path=""'=any(p.proconfig),false)
), 'every application SECURITY DEFINER has an empty fixed search path');
select extensions.ok(not exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','classroom_private') and has_function_privilege('anon',p.oid,'execute')
), 'anonymous callers inherit no application RPC execution');
select extensions.ok(not exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,
    lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
  where n.nspname in ('public','classroom_private') and a.grantee=0 and a.privilege_type='EXECUTE'
), 'PUBLIC has no application function execution');
select extensions.ok(not exists (
  select 1 from pg_catalog.pg_policies where schemaname='public' and cmd='UPDATE' and with_check is null
), 'updatable tables have explicit WITH CHECK ownership');
select extensions.ok(not has_table_privilege('anon','public.stripe_webhook_events','select')
  and not has_table_privilege('authenticated','public.stripe_webhook_events','select')
  and not has_table_privilege('authenticated','public.stripe_webhook_events','insert'),
  'no-policy webhook receipts are intentionally inaccessible to browsers');

insert into auth.users(id,email) values
 ('19000000-0000-4000-8000-000000000001','delete-owner@presales.test'),
 ('19000000-0000-4000-8000-000000000002','delete-student@presales.test'),
 ('19000000-0000-4000-8000-000000000003','retained-owner@presales.test');
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"19000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.personal_workspace',(select workspace_id::text from public.ensure_personal_workspace()),true);
reset role;
insert into public.workspace_billing(workspace_id,stripe_customer_id)
 values(current_setting('test.personal_workspace')::uuid,'cus_local_delete_fixture');
insert into public.workspace_entitlements(workspace_id,plan,status)
 values(current_setting('test.personal_workspace')::uuid,'pro','active');
insert into public.workspaces(id,workspace_type,name,created_by)
 values('39000000-0000-4000-8000-000000000001','organization','Retained organization','19000000-0000-4000-8000-000000000001');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('39000000-0000-4000-8000-000000000001','19000000-0000-4000-8000-000000000001','owner'),
 ('39000000-0000-4000-8000-000000000001','19000000-0000-4000-8000-000000000003','admin');
insert into public.classes(id,workspace_id,name) values
 ('29000000-0000-4000-8000-000000000001','39000000-0000-4000-8000-000000000001','Lifecycle class');
select extensions.throws_ok($$update public.classes set created_by=null where id='29000000-0000-4000-8000-000000000001'$$,
 '42501','immutable_class_scope','even a privileged update cannot clear a still-existing creator');
select extensions.throws_ok($$update public.classes set created_by='19000000-0000-4000-8000-000000000003' where id='29000000-0000-4000-8000-000000000001'$$,
 '42501','immutable_class_scope','creator reassignment remains denied');
set local role authenticated;
select extensions.throws_ok($$update public.classes set created_by=null where id='29000000-0000-4000-8000-000000000001'$$,
 '42501',null,'browser role cannot write creator provenance');
reset role;
insert into public.class_enrollments(class_id,student_user_id)
 values('29000000-0000-4000-8000-000000000001','19000000-0000-4000-8000-000000000002');
insert into public.assignments(id,class_id,title)
 values('49000000-0000-4000-8000-000000000001','29000000-0000-4000-8000-000000000001','Lifecycle assignment');
insert into public.assignment_items(id,assignment_id,position,activity_key,problem_count)
 values('59000000-0000-4000-8000-000000000001','49000000-0000-4000-8000-000000000001',0,'integration.basic_trig.v1',1);
update public.assignments set status='published',published_at=now() where id='49000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"19000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select extensions.is(public.record_assignment_problem_result(
 '59000000-0000-4000-8000-000000000001',1::smallint,'local-delete-result',1790270400000,
 'correct',1,0,1,50,'trig.basic','trig','basic','trig','Beginner',1::smallint),
 'recorded','legitimate enrolled student result succeeds before deletion');
reset role;
delete from auth.users where id='19000000-0000-4000-8000-000000000002';
select extensions.is((select count(*)::integer from public.class_enrollments where student_user_id='19000000-0000-4000-8000-000000000002'),0,'student deletion removes enrollment authorization');
select extensions.is((select count(*)::integer from public.assignment_problem_results where student_user_id='19000000-0000-4000-8000-000000000002'),0,'student deletion removes identifiable results');
delete from auth.users where id='19000000-0000-4000-8000-000000000001';
select extensions.is((select count(*)::integer from public.workspace_members where user_id='19000000-0000-4000-8000-000000000001'),0,'owner deletion removes all membership authorization');
select extensions.is((select count(*)::integer from public.workspaces where id=current_setting('test.personal_workspace')::uuid),0,'personal owner deletion cascades personal tenant');
select extensions.is((select count(*)::integer from public.workspace_billing where workspace_id=current_setting('test.personal_workspace')::uuid),0,'personal billing mapping is removed; external Stripe cancellation is an operator prerequisite');
select extensions.is((select count(*)::integer from public.workspace_entitlements where workspace_id=current_setting('test.personal_workspace')::uuid),0,'personal entitlement does not become an orphaned grant');
select extensions.ok(exists(select 1 from public.workspaces where id='39000000-0000-4000-8000-000000000001' and created_by is null),'organization survives original creator deletion');
select extensions.ok(exists(select 1 from public.classes where id='29000000-0000-4000-8000-000000000001' and created_by is null),'class survives with null creator provenance');
select extensions.ok(exists(select 1 from public.assignments where id='49000000-0000-4000-8000-000000000001' and created_by is null),'assignment survives with null creator provenance');
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"19000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.is((select count(*)::integer from public.workspaces),0,'stale deleted-owner JWT identity has no remaining tenant access');
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"19000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select extensions.is((select count(*)::integer from public.workspaces),1,'remaining legitimate administrator retains organization access');
reset role;
select * from extensions.finish();
rollback;
