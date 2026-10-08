import test from 'node:test';
import assert from 'node:assert/strict';
import {addMonths,nextAdjustment,adjustedRent,collectedAmount,paymentStatus,seedData,validBackup} from '../dist/model.mjs';

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
test('sample records are relationally connected and exportable',()=>{
  const data=seedData('2026-09-22');
  assert.ok(validBackup(data));
  assert.ok(data.contracts.every(c=>data.properties.some(p=>p.id===c.propertyId)&&data.tenants.some(t=>t.id===c.tenantId)));
  assert.ok(data.payments.every(p=>data.contracts.some(c=>c.id===p.contractId)));
});
