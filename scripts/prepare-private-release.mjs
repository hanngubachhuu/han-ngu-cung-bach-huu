import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
export function generateRelease(source, baseline) {
  const quote = (v) => "'" + String(v).replaceAll("'", "''") + "'";
  const block = (body) => {
    let delimiter = "$release$",
      i = 0;
    while (body.includes(delimiter)) delimiter = "$release_" + ++i + "$";
    return `do ${delimiter} begin\n${body}\nend ${delimiter};\n`;
  };
  let sql = `-- REVIEW BEFORE RUNNING. Generated content-only transaction; never publish this file.\nbegin;\ncreate table account_internal.publication_backup_20260927(id text primary key,content jsonb not null,after_hash text);\nrevoke all on account_internal.publication_backup_20260927 from public,anon,authenticated;\n`;
  for (const row of source.payloads) {
    const before = baseline.find((x) => x.id === row.id);
    if (!before) throw Error("Missing baseline for " + row.id);
    const client = row.content.client_view;
    const update = client
      ? `jsonb_set(content,'{client_view}',${quote(JSON.stringify(client))}::jsonb)`
      : `replace(content::text,'audio/hsk1/','supabase://lesson-private/hsk1/')::jsonb`;
    sql += block(
      ` perform 1 from public.lesson_content where id=${quote(row.id)} for update;\n if (select md5(content::text) from public.lesson_content where id=${quote(row.id)}) is distinct from ${quote(before.content_hash)} then raise exception 'CONTENT_CHANGED'; end if;\n insert into account_internal.publication_backup_20260927(id,content) select id,content from public.lesson_content where id=${quote(row.id)};\n update public.lesson_content set content=${update},updated_at=now() where id=${quote(row.id)};\n update account_internal.publication_backup_20260927 b set after_hash=md5(l.content::text) from public.lesson_content l where b.id=l.id and b.id=${quote(row.id)};`,
    );
  }
  for (const asset of source.assets) {
    sql += block(
      ` if not exists(select 1 from storage.objects where bucket_id=${quote(asset.bucket)} and name=${quote(asset.object_path)}) then raise exception 'PRIVATE_ASSET_NOT_UPLOADED'; end if;\n if exists(select 1 from public.lesson_assets where bucket_id=${quote(asset.bucket)} and object_path=${quote(asset.object_path)} and lesson_id<>${quote(asset.lesson_id)}) then raise exception 'ASSET_OWNER_CONFLICT'; end if;`,
    );
    sql += `insert into public.lesson_assets(lesson_id,bucket_id,object_path) values(${quote(asset.lesson_id)},${quote(asset.bucket)},${quote(asset.object_path)}) on conflict(bucket_id,object_path) do nothing;\n`;
  }
  sql += "notify pgrst,'reload schema';\ncommit;\n";
  const rollback = `-- Restore only unchanged post-release content; investigate skipped rows.\nbegin;\nupdate public.lesson_content l set content=b.content,updated_at=now() from account_internal.publication_backup_20260927 b where l.id=b.id and md5(l.content::text)=b.after_hash returning l.id;\ncommit;\n`;
  return { sql, rollback };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const source = JSON.parse(
    await fs.readFile(".cache/private-publication.json", "utf8"),
  );
  const baseline = JSON.parse(
    await fs.readFile(".cache/private-baseline.json", "utf8"),
  );
  const { sql, rollback } = generateRelease(source, baseline);
  await fs.writeFile(".cache/private-release.sql", sql);
  await fs.writeFile(".cache/private-release-rollback.sql", rollback);
  console.log(
    `Prepared one transaction for ${source.payloads.length} lessons and ${source.assets.length} assets, plus a guarded rollback. No database changes made.`,
  );
}
