import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { emptyFormTransformation } from '../src/features/forms/form-transformation';
import { emptyRaceForm } from '../src/features/races/race-forms';

/** Rehearse 0094 -> 0096 with an already-active immutable Form and pending Return. */
export async function verifyFormsLifecycleUpgrade(connectionString:string,root:string) {
  assert.match(connectionString,/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_forms_upgrade_dev$/);
  const pool=new pg.Pool({connectionString});
  try {
    const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
    const entries=journal.entries.filter((e:{idx:number})=>e.idx<95),folder=path.join(root,'before-forms-lifecycle');
    await mkdir(path.join(folder,'meta'),{recursive:true});await writeFile(path.join(folder,'meta/_journal.json'),JSON.stringify({...journal,entries}));
    for(const entry of entries)await copyFile(path.join('drizzle',`${entry.tag}.sql`),path.join(folder,`${entry.tag}.sql`));
    await migrate(drizzle(pool),{migrationsFolder:folder});
    const insert=async(sql:string,params:unknown[]=[]) => (await pool.query(sql,params)).rows[0].id;
    await pool.query(`insert into "user"(id,name,email) values('forms-upgrade','Form upgrade','forms-upgrade@example.invalid')`);
    const campaign=await insert("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values('Forms upgrade',100,100,50,10,100,0,'Credits','Assigned','forms-upgrade') returning id");
    await pool.query("insert into campaign_player(campaign_id,user_id) values($1,'forms-upgrade')",[campaign]);
    const character=await insert("insert into campaign_character(campaign_id,player_user_id,name) values($1,'forms-upgrade','Existing Form individual') returning id",[campaign]);
    const race=await insert("insert into races(name) values('Existing Form Race') returning id");
    const form=await insert("insert into race_forms(race_id,key,name,sort_order) values($1,'existing','Existing Form',0) returning id",[race]);
    const transformation=emptyFormTransformation();transformation.duration={mode:'persistent',description:'Keep the frozen body'};
    const evidence={review:{characterId:character,campaignId:campaign,operation:'enter',activeEntryId:null,encounterId:null,encounterContexts:[],transformation,definition:{kind:'race',sourceId:race,sourceName:'Existing Form Race',formId:form,key:'existing',name:'Existing Form',sourceHash:'frozen',form:{...emptyRaceForm('existing'),id:form,raceId:race,transformation}}},completionContexts:[],command:{rulings:{}},initiatedByUserId:'forms-upgrade',authorizedByUserId:'forms-upgrade',authority:'god',costsPaid:[]};
    const request=await insert("insert into form_transition_request(character_id,campaign_id,actor_user_id,idempotency_key,request_hash,operation,status,evidence) values($1,$2,'forms-upgrade','existing-form-entry','hash','enter','pending',$3) returning id",[character,campaign,evidence]);
    const event=await insert("insert into form_transition_event(request_id,character_id,campaign_id,operation,owner_kind,source_race_id,race_form_id,form_key,source_hash,evidence) values($1,$2,$3,'enter','race',$4,$5,'existing','frozen',$6) returning id",[request,character,campaign,race,form,evidence]);
    await pool.query("update form_transition_request set status='completed',completed_at=now() where id=$1",[request]);
    await pool.query('insert into campaign_character_active_form(character_id,entry_event_id) values($1,$2)',[character,event]);
    await pool.query("insert into form_transition_request(character_id,campaign_id,actor_user_id,idempotency_key,request_hash,operation,status,evidence) values($1,$2,'forms-upgrade','existing-form-return','return-hash','return','pending',$3)",[character,campaign,{...evidence,review:{...evidence.review,operation:'return',activeEntryId:event}}]);
    await pool.query('insert into campaign_character_active_health(character_id,total_damage) values($1,13)',[character]);
    const tables=(await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows as Array<{tablename:string}>;
    const read=async()=>Promise.all(tables.map(({tablename})=>pool.query(`select to_jsonb(t)${tablename==='campaign_character_active_form'?" - 'return_due_json'":''} body from "${tablename}" t order by to_jsonb(t)::text`).then(r=>r.rows)));
    const before=await read();await migrate(drizzle(pool),{migrationsFolder:'drizzle'});assert.deepEqual(await read(),before);
    assert.equal((await pool.query('select return_due_json from campaign_character_active_form where character_id=$1',[character])).rows[0].return_due_json,null);
    assert.equal((await pool.query('select count(*)::int n from form_use_reset_event')).rows[0].n,0);
    console.log('PASS: populated 0094 -> 0096 preserves every prior table, active frozen entry, pending Return and Health; no inferred expiry or refresh.');
  } finally {await pool.end();}
}
