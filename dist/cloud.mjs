import {seedData,todayISO} from './model.mjs';

export const SUPABASE_URL='https://iqaoveeivpafijdxzhmr.supabase.co';
export const SUPABASE_KEY='sb_publishable_B467-pjCAmPCjJiftvvWQw_EPP5kbgE';
const SESSION_KEY='ambito-cloud-session-v1';
const ORG_ID='00000000-0000-4000-8000-000000000001';

let session=null;

export class CloudError extends Error{
  constructor(message,status=0,detail=''){super(message);this.name='CloudError';this.status=status;this.detail=detail;}
}

function readSession(){
  try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{return null;}
}

function storeSession(value){
  session=value;
  if(value)localStorage.setItem(SESSION_KEY,JSON.stringify(value));
  else localStorage.removeItem(SESSION_KEY);
  return value;
}

async function parseResponse(response){
  const text=await response.text();
  let body=null;
  try{body=text?JSON.parse(text):null;}catch{body=text;}
  if(!response.ok){
    const message=body?.msg||body?.message||body?.error_description||body?.error||'No se pudo completar la operación.';
    throw new CloudError(message,response.status,body?.details||body?.hint||'');
  }
  return body;
}

async function authFetch(path,body,token=''){
  return parseResponse(await fetch(`${SUPABASE_URL}/auth/v1/${path}`,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
    body:JSON.stringify(body||{})
  }));
}

export async function signIn(email,password){
  const result=await authFetch('token?grant_type=password',{email:email.trim().toLowerCase(),password});
  return storeSession(result);
}

export async function signUp(email,password,fullName){
  const result=await authFetch('signup',{email:email.trim().toLowerCase(),password,data:{full_name:fullName.trim()}});
  if(result?.access_token)storeSession(result);
  return result;
}

export async function signOut(){
  const token=(session||readSession())?.access_token;
  try{if(token)await authFetch('logout',{},token);}finally{storeSession(null);}
}

async function refresh(){
  const current=session||readSession();
  if(!current?.refresh_token)throw new CloudError('La sesión venció. Volvé a ingresar.',401);
  const result=await authFetch('token?grant_type=refresh_token',{refresh_token:current.refresh_token});
  return storeSession(result);
}

export async function restoreSession(){
  const current=readSession();
  if(!current?.access_token)return null;
  session=current;
  const expiresAt=Number(current.expires_at||0);
  if(expiresAt&&expiresAt*1000>Date.now()+60000)return current;
  try{return await refresh();}catch{storeSession(null);return null;}
}

export const currentUser=()=>session?.user||readSession()?.user||null;

async function api(path,{method='GET',body,headers={},retry=true}={}){
  session=session||readSession();
  if(!session?.access_token)throw new CloudError('Necesitás iniciar sesión.',401);
  const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    method,
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json',...headers},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  if(response.status===401&&retry){await refresh();return api(path,{method,body,headers,retry:false});}
  return parseResponse(response);
}

const select=(table,query='select=*')=>api(`${table}?${query}`);
const insert=(table,rows)=>api(table,{method:'POST',body:rows,headers:{Prefer:'return=representation'}});
const update=(table,id,row)=>api(`${table}?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:row,headers:{Prefer:'return=representation'}});
const remove=(table,id)=>api(`${table}?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});
export const rpc=(name,body)=>api(`rpc/${name}`,{method:'POST',body});

const byNewest=(a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''));

export async function loadPortal(){
  const [profiles,properties,tenants,contracts,charges,receipts,adjustments]=await Promise.all([
    select('profiles','select=*'),select('properties','select=*'),select('tenants','select=*'),
    select('contracts','select=*'),select('charges','select=*'),select('receipts','select=*'),select('adjustments','select=*')
  ]);
  const user=currentUser();
  const profile=profiles.find(item=>item.user_id===user?.id);
  if(!profile?.active)throw new CloudError('Tu correo no tiene acceso activo a este portal.',403);
  const receiptMap=new Map();
  for(const receipt of receipts){
    if(!receiptMap.has(receipt.charge_id))receiptMap.set(receipt.charge_id,[]);
    receiptMap.get(receipt.charge_id).push(receipt);
  }
  const payments=charges.map(row=>{
    const linked=(receiptMap.get(row.id)||[]).sort(byNewest);
    return {id:row.id,contractId:row.contract_id,kind:row.concept,period:row.period,amount:Number(row.amount),dueDate:row.due_date,
      paidAmount:linked.reduce((sum,item)=>sum+Number(item.amount),0),paidDate:linked[0]?.paid_date||'',notes:row.notes||'',
      createdBy:row.created_by,updatedBy:row.updated_by,createdAt:row.created_at,receipts:linked.map(item=>({id:item.id,amount:Number(item.amount),paidDate:item.paid_date,notes:item.notes||'',createdBy:item.created_by,createdAt:item.created_at}))};
  });
  let audit=[];let invites=[];
  if(profile.role==='admin'){
    [audit,invites]=await Promise.all([select('audit_log','select=*&order=occurred_at.desc&limit=250'),select('access_invites','select=*&order=created_at.desc')]);
  }
  return {version:2,profile,profiles,invites,audit,properties:properties.map(row=>({id:row.id,address:row.address,city:row.city,type:row.property_type,bedrooms:row.bedrooms,parking:row.parking,createdBy:row.created_by,updatedBy:row.updated_by})),tenants:tenants.map(row=>({id:row.id,name:row.full_name,email:row.email,phone:row.phone,createdBy:row.created_by,updatedBy:row.updated_by})),contracts:contracts.map(row=>({id:row.id,propertyId:row.property_id,tenantId:row.tenant_id,start:row.start_date,end:row.end_date,rent:Number(row.monthly_rent),frequency:row.adjustment_frequency_months,lastAdjustmentDate:row.last_adjustment_date||'',dueDay:row.due_day,deposit:Number(row.deposit_amount),guarantee:row.guarantee_type,guaranteeDetail:row.guarantee_detail,createdBy:row.created_by,updatedBy:row.updated_by})),payments,adjustments:adjustments.map(row=>({id:row.id,contractId:row.contract_id,date:row.effective_date,rate:Number(row.rate),before:Number(row.previous_rent),after:Number(row.new_rent),createdBy:row.created_by,createdAt:row.created_at}))};
}

const entityMap={
  property:{table:'properties',toRow:o=>({organization_id:ORG_ID,address:o.address,city:o.city,property_type:o.type,bedrooms:o.bedrooms,parking:o.parking})},
  tenant:{table:'tenants',toRow:o=>({organization_id:ORG_ID,full_name:o.name,email:o.email,phone:o.phone})},
  contract:{table:'contracts',toRow:o=>({organization_id:ORG_ID,property_id:o.propertyId,tenant_id:o.tenantId,start_date:o.start,end_date:o.end,monthly_rent:o.rent,adjustment_frequency_months:o.frequency,last_adjustment_date:o.lastAdjustmentDate||null,due_day:o.dueDay,deposit_amount:o.deposit,guarantee_type:o.guarantee,guarantee_detail:o.guaranteeDetail})},
  payment:{table:'charges',toRow:o=>({organization_id:ORG_ID,contract_id:o.contractId,concept:o.kind,period:o.period,due_date:o.dueDate,amount:o.amount,notes:o.notes||''})}
};

export async function saveEntity(type,id,obj){
  const spec=entityMap[type];
  if(!spec)throw new CloudError('Tipo de registro no reconocido.');
  const result=id?await update(spec.table,id,spec.toRow(obj)):await insert(spec.table,spec.toRow(obj));
  return result?.[0]||null;
}

export async function deleteEntity(type,id){
  const spec=entityMap[type];
  if(!spec)throw new CloudError('Tipo de registro no reconocido.');
  return remove(spec.table,id);
}

export async function addReceipt(chargeId,amount,paidDate,notes=''){
  return insert('receipts',{organization_id:ORG_ID,charge_id:chargeId,amount,paid_date:paidDate,notes});
}

export async function saveAdjustment(contractId,date,rate,before,after){
  await insert('adjustments',{organization_id:ORG_ID,contract_id:contractId,effective_date:date,rate,previous_rent:before,new_rent:after});
  await update('contracts',contractId,{monthly_rent:after,last_adjustment_date:date});
}

export async function logCsvExport(filters){return rpc('log_export',{report_name:'pagos_csv',filters});}

export async function setAccessInvite(email,role,active=true){return rpc('set_access_invite',{target_email:email,access_role:role,is_active:active});}

export async function ensureRentCharges(contracts,payments,period){
  const [year,month]=period.split('-').map(Number);
  const lastDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  const start=`${period}-01`,end=`${period}-${String(lastDay).padStart(2,'0')}`;
  const missing=contracts.filter(c=>c.start<=end&&c.end>=start&&!payments.some(p=>p.contractId===c.id&&p.kind==='Alquiler'&&p.period===period));
  for(const contract of missing){
    const day=Math.min(Math.max(1,Number(contract.dueDay)||10),lastDay);
    try{await insert('charges',{organization_id:ORG_ID,contract_id:contract.id,concept:'Alquiler',period,due_date:`${period}-${String(day).padStart(2,'0')}`,amount:Number(contract.rent)||0,notes:''});}
    catch(error){if(error.status!==409)throw error;}
  }
  return missing.length;
}

export async function seedFictitiousData(){
  const seed=seedData(todayISO());
  const propertyIds=new Map(seed.properties.map(item=>[item.id,crypto.randomUUID()]));
  const tenantIds=new Map(seed.tenants.map(item=>[item.id,crypto.randomUUID()]));
  const contractIds=new Map(seed.contracts.map(item=>[item.id,crypto.randomUUID()]));
  await insert('properties',seed.properties.map(item=>({id:propertyIds.get(item.id),organization_id:ORG_ID,address:item.address,city:item.city,property_type:item.type,bedrooms:item.bedrooms,parking:item.parking})));
  await insert('tenants',seed.tenants.map(item=>({id:tenantIds.get(item.id),organization_id:ORG_ID,full_name:item.name,email:item.email,phone:item.phone})));
  await insert('contracts',seed.contracts.map(item=>({id:contractIds.get(item.id),organization_id:ORG_ID,property_id:propertyIds.get(item.propertyId),tenant_id:tenantIds.get(item.tenantId),start_date:item.start,end_date:item.end,monthly_rent:item.rent,adjustment_frequency_months:item.frequency,last_adjustment_date:item.lastAdjustmentDate||null,due_day:item.dueDay,deposit_amount:item.deposit,guarantee_type:item.guarantee,guarantee_detail:item.guaranteeDetail})));
  const chargeIds=new Map(seed.payments.map(item=>[item.id,crypto.randomUUID()]));
  await insert('charges',seed.payments.map(item=>({id:chargeIds.get(item.id),organization_id:ORG_ID,contract_id:contractIds.get(item.contractId),concept:item.kind,period:item.period,due_date:item.dueDate,amount:item.amount,notes:'Dato ficticio de demostración'})));
  const paid=seed.payments.filter(item=>Number(item.paidAmount)>0);
  if(paid.length)await insert('receipts',paid.map(item=>({organization_id:ORG_ID,charge_id:chargeIds.get(item.id),amount:item.paidAmount,paid_date:item.paidDate||todayISO(),notes:'Pago ficticio de demostración'})));
}
