import test from 'node:test';
import assert from 'node:assert/strict';
import {addMonths,periodsBetween,rentForDate,planRentCharges,nextAdjustment,adjustedRent,collectedAmount,paymentStatus,seedData,validBackup} from '../dist/model.mjs';

test('month addition clamps dates at the end of shorter months',()=>{
  assert.equal(addMonths('2026-01-31',1),'2026-02-28');
  assert.equal(addMonths('2028-01-31',1),'2028-02-29');
});
test('the next adjustment follows the latest applied adjustment',()=>{
  assert.equal(nextAdjustment({start:'2026-01-01',frequency:4,lastAdjustmentDate:'2026-09-01'}),'2027-01-01');
  assert.equal(adjustedRent(480000,12.5),540000);
});
test('a recorded payment stays paid even after its due date',()=>{
  assert.equal(paymentStatus({amount:100, dueDate:'2026-01-01',paidDate:'2026-01-05'},'2026-09-22'),'pagado');
  assert.equal(paymentStatus({amount:100, dueDate:'2026-01-01',paidDate:''},'2026-09-22'),'vencido');
});
test('partial payments preserve the outstanding balance state',()=>{
  const payment={amount:500000,paidAmount:180000,dueDate:'2026-10-10',paidDate:'2026-10-08'};
  assert.equal(collectedAmount(payment),180000);
  assert.equal(paymentStatus(payment,'2026-10-08'),'parcial');
  assert.equal(paymentStatus({...payment,paidAmount:500000},'2026-10-08'),'pagado');
});
test('missing monthly periods can be recovered without duplicates',()=>{
  assert.deepEqual(periodsBetween('2026-10','2027-02'),['2026-10','2026-11','2026-12','2027-01','2027-02']);
  assert.deepEqual(periodsBetween('2027-02','2026-10'),[]);
});
test('historical rent uses the adjustment effective at the due date',()=>{
  const contract={id:'c1',rent:620000};
  const adjustments=[
    {contractId:'c1',date:'2026-07-01',before:500000,after:560000},
    {contractId:'c1',date:'2026-10-01',before:560000,after:620000}
  ];
  assert.equal(rentForDate(contract,adjustments,'2026-06-10'),500000);
  assert.equal(rentForDate(contract,adjustments,'2026-08-10'),560000);
  assert.equal(rentForDate(contract,adjustments,'2026-10-10'),620000);
});
test('rent planning fills skipped months even when the previous rent is unpaid',()=>{
  const contracts=[{id:'c1',start:'2026-10-01',end:'2027-09-30',rent:500000,dueDay:10}];
  const payments=[{contractId:'c1',kind:'Alquiler',period:'2026-10',amount:500000,paidAmount:0,dueDate:'2026-10-10'}];
  assert.deepEqual(planRentCharges(contracts,payments,'2026-12'),[
    {contractId:'c1',period:'2026-11',dueDate:'2026-11-10',amount:500000},
    {contractId:'c1',period:'2026-12',dueDate:'2026-12-10',amount:500000}
  ]);
});
test('sample records are relationally connected and exportable',()=>{
  const data=seedData('2026-09-22');
  assert.ok(validBackup(data));
  assert.ok(data.contracts.every(c=>data.properties.some(p=>p.id===c.propertyId)&&data.tenants.some(t=>t.id===c.tenantId)));
  assert.ok(data.payments.every(p=>data.contracts.some(c=>c.id===p.contractId)));
  assert.ok(data.properties.every(p=>data.complexes.some(c=>c.id===p.complexId)));
  assert.ok(data.parkingSpaces.every(p=>data.complexes.some(c=>c.id===p.complexId)));
  assert.ok(data.parkingAssignments.every(a=>data.parkingSpaces.some(p=>p.id===a.parkingSpaceId)&&data.contracts.some(c=>c.id===a.contractId)));
});
