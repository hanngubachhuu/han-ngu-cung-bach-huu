-- The publication function's local assignment-version record is named v.
-- Use a distinct relation alias in the Admin-only processing query; otherwise
-- PL/pgSQL resolves v.assignment_version_id against that local record.
-- Preserve the existing function OID, privileges and every other operation.
do $repair$
declare
 original text:=pg_get_functiondef('public.hskk_publication_before_makeup(text,jsonb)'::regprocedure);
 repaired text;
begin
 repaired:=replace(original,
  'join account_internal.hskk_delivery_versions v on v.assignment_version_id=s.assignment_version_id',
  'join account_internal.hskk_delivery_versions delivery_version on delivery_version.assignment_version_id=s.assignment_version_id');
 repaired:=replace(repaired,
  'and v.exam_id=code) then raise exception ''SUBMISSION_NOT_FOUND''',
  'and delivery_version.exam_id=code) then raise exception ''SUBMISSION_NOT_FOUND''');
 if repaired=original or position('and delivery_version.exam_id=code) then raise exception ''SUBMISSION_NOT_FOUND''' in repaired)=0 then
  raise exception 'HSKK_PROCESS_DEFINITION_MISMATCH';
 end if;
 execute repaired;
end $repair$;
notify pgrst,'reload schema';
