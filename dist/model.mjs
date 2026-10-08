export const todayISO = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Mendoza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function parseDate(s){const [y,m,d]=s.split('-').map(Number);return new Date(Date.UTC(y,m-1,d));}
export function iso(d){return d.toISOString().slice(0,10);}
export function addDays(s,n){const d=parseDate(s);d.setUTCDate(d.getUTCDate()+n);return iso(d);}
export function addMonths(s,n){const [y,m,day]=s.split('-').map(Number);const target=new Date(Date.UTC(y,m-1+n,1));const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(day,last));return iso(target);}
export const monthOf=s=>s.slice(0,7);
export function periodsBetween(from,to){
  if(!/^\d{4}-\d{2}$/.test(from)||!/^\d{4}-\d{2}$/.test(to)||from>to)return [];
  const periods=[];let cursor=from;
  while(cursor<=to&&periods.length<1200){periods.push(cursor);cursor=monthOf(addMonths(cursor+'-01',1));}
  return periods;
}
export const daysBetween=(a,b)=>Math.round((parseDate(b)-parseDate(a))/86400000);
export const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n)||0);
export const dateLabel=s=>s?new Intl.DateTimeFormat('es-AR',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'}).format(parseDate(s)):'—';
export function nextAdjustment(c){const months=Number(c.frequency);if(!Number.isInteger(months)||months<1||months>60)return null;return addMonths(c.lastAdjustmentDate||c.start,months);}
export function adjustedRent(rent,rate){if(!Number.isFinite(Number(rent))||!Number.isFinite(Number(rate))||Number(rate)<0)return null;return Math.round(Number(rent)*(1+Number(rate)/100)*100)/100;}
export function collectedAmount(p){return Math.max(0,Math.min(Number(p.amount)||0,p.paidAmount===undefined?(p.paidDate?Number(p.amount)||0:0):Number(p.paidAmount)||0));}
export function paymentStatus(p,today=todayISO()){const paid=collectedAmount(p),total=Number(p.amount)||0;if(total>0&&paid>=total)return 'pagado';if(paid>0)return 'parcial';return p.dueDate<today?'vencido':'pendiente';}
export function rentForDate(contract,adjustments,date){
  const history=adjustments.filter(item=>item.contractId===contract.id).sort((a,b)=>a.date.localeCompare(b.date));
  if(!history.length)return Number(contract.rent)||0;
  const applied=history.filter(item=>item.date<=date).at(-1);
  return Number(applied?.after??history[0]?.before??contract.rent)||0;
}
export function planRentCharges(contracts,payments,currentPeriod,adjustments=[]){
  const planned=[];
  for(const contract of contracts){
    const existing=payments.filter(item=>item.contractId===contract.id&&item.kind==='Alquiler').sort((a,b)=>a.period.localeCompare(b.period));
    const firstPeriod=existing[0]?.period||currentPeriod;
    const lastPeriod=[currentPeriod,String(contract.end).slice(0,7)].sort()[0];
    if(firstPeriod>lastPeriod)continue;
    for(const period of periodsBetween(firstPeriod,lastPeriod)){
      if(existing.some(item=>item.period===period))continue;
      const [year,month]=period.split('-').map(Number),lastDay=new Date(Date.UTC(year,month,0)).getUTCDate(),day=Math.min(Math.max(1,Number(contract.dueDay)||10),lastDay);
      let dueDate=`${period}-${String(day).padStart(2,'0')}`;
      if(dueDate<contract.start)dueDate=contract.start;
      if(dueDate>contract.end)dueDate=contract.end;
      planned.push({contractId:contract.id,period,dueDate,amount:rentForDate(contract,adjustments,dueDate)});
    }
  }
  return planned;
}
export function seedData(today=todayISO()){
  const ym=monthOf(today), nextMonth=monthOf(addMonths(ym+'-01',1));
  return {version:3,complexes:[
    {id:'x1',name:'Complejo Alameda (ficticio)',address:'Av. Ejemplo 100',city:'Mendoza'},
    {id:'x2',name:'Complejo Chacras (ficticio)',address:'Calle Demostración 250',city:'Luján de Cuyo'}
  ],properties:[
    {id:'p1',complexId:'x1',unitLabel:'Depto 5',address:'Av. Ejemplo 100 · Depto 5',city:'Mendoza',type:'Departamento',bedrooms:2},
    {id:'p2',complexId:'x1',unitLabel:'Depto 8',address:'Av. Ejemplo 100 · Depto 8',city:'Mendoza',type:'Departamento',bedrooms:1},
    {id:'p3',complexId:'x2',unitLabel:'Casa 3',address:'Calle Demostración 250 · Casa 3',city:'Luján de Cuyo',type:'Casa',bedrooms:3},
    {id:'p4',complexId:'x2',unitLabel:'Casa 7',address:'Calle Demostración 250 · Casa 7',city:'Luján de Cuyo',type:'Casa',bedrooms:2}
  ],tenants:[
    {id:'t1',name:'Inquilino A (ficticio)',email:'',phone:''},
    {id:'t2',name:'Inquilino B (ficticio)',email:'',phone:''},
    {id:'t3',name:'Inquilino C (ficticio)',email:'',phone:''}
  ],contracts:[
    {id:'c1',propertyId:'p1',tenantId:'t1',start:addMonths(today,-2).slice(0,8)+'01',end:addMonths(today,10),rent:480000,frequency:3,lastAdjustmentDate:'',deposit:480000,guarantee:'Recibo de sueldo',guaranteeDetail:'Referencia ficticia · sin documentación',dueDay:10},
    {id:'c2',propertyId:'p2',tenantId:'t2',start:addMonths(today,-4).slice(0,8)+'01',end:addDays(today,35),rent:355000,frequency:4,lastAdjustmentDate:'',deposit:355000,guarantee:'Seguro de caución',guaranteeDetail:'Referencia ficticia · sin documentación',dueDay:5},
    {id:'c3',propertyId:'p3',tenantId:'t3',start:addDays(addMonths(today,-3),18),end:addMonths(today,9),rent:690000,frequency:3,lastAdjustmentDate:'',deposit:690000,guarantee:'Garantía propietaria',guaranteeDetail:'Referencia ficticia · sin documentación',dueDay:15}
  ],parkingSpaces:[
    {id:'ps1',complexId:'x1',code:'Cochera 2',notes:'Dato ficticio'},
    {id:'ps2',complexId:'x1',code:'Cochera 7',notes:'Dato ficticio'},
    {id:'ps3',complexId:'x2',code:'Cochera 1',notes:'Dato ficticio'}
  ],parkingAssignments:[
    {id:'pa1',parkingSpaceId:'ps1',contractId:'c1',start:addMonths(today,-2).slice(0,8)+'01',end:addMonths(today,10),notes:'Asignación ficticia'},
    {id:'pa2',parkingSpaceId:'ps3',contractId:'c3',start:addDays(addMonths(today,-3),18),end:addMonths(today,9),notes:'Asignación ficticia'}
  ],payments:[
    {id:'m1',contractId:'c1',kind:'Alquiler',period:ym,amount:480000,paidAmount:480000,dueDate:addDays(today,-12),paidDate:addDays(today,-10)},
    {id:'m2',contractId:'c2',kind:'Alquiler',period:ym,amount:355000,paidAmount:0,dueDate:addDays(today,-5),paidDate:''},
    {id:'m3',contractId:'c3',kind:'Alquiler',period:ym,amount:690000,paidAmount:200000,dueDate:addDays(today,5),paidDate:addDays(today,-1)},
    {id:'m4',contractId:'c1',kind:'Expensas',period:ym,amount:88000,paidAmount:88000,dueDate:addDays(today,-8),paidDate:addDays(today,-7)},
    {id:'m5',contractId:'c2',kind:'Expensas',period:ym,amount:65000,paidAmount:0,dueDate:addDays(today,6),paidDate:''},
    {id:'m6',contractId:'c3',kind:'Alquiler',period:nextMonth,amount:690000,paidAmount:0,dueDate:addDays(today,31),paidDate:''}
  ],adjustments:[]};
}
export function validBackup(d){return !!d&&[1,2,3].includes(d.version)&&['properties','tenants','contracts','payments','adjustments'].every(k=>Array.isArray(d[k]))&&d.properties.every(p=>p.id&&p.address)&&d.tenants.every(t=>t.id&&t.name)&&d.contracts.every(c=>c.id&&c.propertyId&&c.tenantId&&c.start&&c.end&&Number(c.frequency)>0)&&d.payments.every(p=>p.id&&p.contractId&&p.period&&p.dueDate)&&d.adjustments.every(a=>a.id&&a.contractId)&&(!d.complexes||Array.isArray(d.complexes))&&(!d.parkingSpaces||Array.isArray(d.parkingSpaces))&&(!d.parkingAssignments||Array.isArray(d.parkingAssignments));}
