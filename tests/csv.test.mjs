import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCsv,csvTextCell,csvNumberCell} from '../dist/csv.mjs';

test('CSV text cells escape quotes and neutralize spreadsheet formulas',()=>{
  assert.equal(csvTextCell('Inquilino "A"'),'"Inquilino ""A"""');
  assert.equal(csvTextCell('=HYPERLINK("bad")'),'"\'=HYPERLINK(""bad"")"');
});

test('CSV uses semicolon separators and numeric values stay numeric for Excel',()=>{
  const csv=buildCsv([
    {label:'Propiedad',get:r=>r.name},
    {label:'Monto cobrado',get:r=>r.paid,type:'number'}
  ],[{name:'Unidad ficticia',paid:125000.5}]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"Propiedad";"Monto cobrado"'));
  assert.ok(csv.includes('"Unidad ficticia";125000,5'));
  assert.equal(csvNumberCell(0), '0');
});
