export const todayISO = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Mendoza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function parseDate(s){const [y,m,d]=s.split('-').map(Number);return new Date(Date.UTC(y,m-1,d));}
export function iso(d){return d.toISOString().slice(0,10);}
export function addDays(s,n){const d=parseDate(s);d.setUTCDate(d.getUTCDate()+n);return iso(d);}
export function addMonths(s,n){const [y,m,day]=s.split('-').map(Number);const target=new Date(Date.UTC(y,m-1+n,1));const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(day,last));return iso(target);}
export const monthOf=s=>s.slice(0,7);
export const daysBetween=(a,b)=>Math.round((parseDate(b)-parseDate(a))/86400000);
export const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n)||0);
export const dateLabel=s=>s?new Intl.DateTimeFormat('es-AR',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'}).format(parseDate(s)):'—';
export function nextAdjustment(c){const months=Number(c.frequency);if(!Number.isInteger(months)||months<1||months>60)return null;return addMonths(c.lastAdjustmentDate||c.start,months);}
export function adjustedRent(rent,rate){if(!Number.isFinite(Number(rent))||!Number.isFinite(Number(rate))||Number(rate)<0)return null;return Math.round(Number(rent)*(1+Number(rate)/100)*100)/100;}
export function collectedAmount(p){return Math.max(0,Math.min(Number(p.amount)||0,p.paidAmount===undefined?(p.paidDate?Number(p.amount)||0:0):Number(p.paidAmount)||0));}
export function paymentStatus(p,today=todayISO()){const paid=collectedAmount(p),total=Number(p.amount)||0;if(total>0&&paid>=total)return 'pagado';if(paid>0)return 'parcial';return p.dueDate<today?'vencido':'pendiente';}
export function seedData(today=todayISO()){
  const ym=monthOf(today), nextMonth=monthOf(addMonths(ym+'-01',1));
  return {version:1,properties:[
    {id:'p1',address:'Unidad 01 · Centro (ficticia)',city:'Mendoza',type:'Departamento',bedrooms:2,parking:true},
    {id:'p2',address:'Unidad 02 · Godoy Cruz (ficticia)',city:'Godoy Cruz',type:'Departamento',bedrooms:1,parking:false},
    {id:'p3',address:'Unidad 03 · Guaymallén (ficticia)',city:'Guaymallén',type:'Casa',bedrooms:3,parking:true},
    {id:'p4',address:'Unidad 04 · Chacras (ficticia)',city:'Luján de Cuyo',type:'Casa',bedrooms:2,parking:true}
  ],tenants:[
    {id:'t1',name:'Inquilino A (ficticio)',email:'',phone:''},
    {id:'t2',name:'Inquilino B (ficticio)',email:'',phone:''},
    {id:'t3',name:'Inquilino C (ficticio)',email:'',phone:''}
  ],contracts:[
    {id:'c1',propertyId:'p1',tenantId:'t1',start:addMonths(today,-2).slice(0,8)+'01',end:addMonths(today,10),rent:480000,frequency:3,lastAdjustmentDate:'',deposit:480000,guarantee:'Recibo de sueldo',guaranteeDetail:'Referencia ficticia · sin documentación',dueDay:10},
    {id:'c2',propertyId:'p2',tenantId:'t2',start:addMonths(today,-4).slice(0,8)+'01',end:addDays(today,35),rent:355000,frequency:4,lastAdjustmentDate:'',deposit:355000,guarantee:'Seguro de caución',guaranteeDetail:'Referencia ficticia · sin documentación',dueDay:5},
    {id:'c3',propertyId:'p3',tenantId:'t3',start:addDays(addMonths(today,-3),18),end:addMonths(today,9),rent:690000,frequency:3,lastAdjustmentDate:'',deposit:690000,guarantee:'Garantía propietaria',guaranteeDetail:'Referencia ficticia · sin documentación',dueDay:15}
  ],payments:[
    {id:'m1',contractId:'c1',kind:'Alquiler',period:ym,amount:480000,paidAmount:480000,dueDate:addDays(today,-12),paidDate:addDays(today,-10)},
    {id:'m2',contractId:'c2',kind:'Alquiler',period:ym,amount:355000,paidAmount:0,dueDate:addDays(today,-5),paidDate:''},
    {id:'m3',contractId:'c3',kind:'Alquiler',period:ym,amount:690000,paidAmount:200000,dueDate:addDays(today,5),paidDate:addDays(today,-1)},
    {id:'m4',contractId:'c1',kind:'Expensas',period:ym,amount:88000,paidAmount:88000,dueDate:addDays(today,-8),paidDate:addDays(today,-7)},
    {id:'m5',contractId:'c2',kind:'Expensas',period:ym,amount:65000,paidAmount:0,dueDate:addDays(today,6),paidDate:''},
    {id:'m6',contractId:'c3',kind:'Alquiler',period:nextMonth,amount:690000,paidAmount:0,dueDate:addDays(today,31),paidDate:''}
  ],adjustments:[]};
}
export function validBackup(d){return !!d&&d.version===1&&['properties','tenants','contracts','payments','adjustments'].every(k=>Array.isArray(d[k]))&&d.properties.every(p=>p.id&&p.address)&&d.tenants.every(t=>t.id&&t.name)&&d.contracts.every(c=>c.id&&c.propertyId&&c.tenantId&&c.start&&c.end&&Number(c.frequency)>0)&&d.payments.every(p=>p.id&&p.contractId&&p.period&&p.dueDate)&&d.adjustments.every(a=>a.id&&a.contractId);}
