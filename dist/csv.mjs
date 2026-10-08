export function csvTextCell(value){
  let text=String(value??'');
  if(/^[=+\-@\t\r]/.test(text))text="'"+text;
  return `"${text.replace(/"/g,'""')}"`;
}

export function csvNumberCell(value){
  const number=Number(value);
  if(!Number.isFinite(number))return '0';
  return String(number).replace('.',',');
}

export function buildCsv(columns,records){
  const header=columns.map(column=>csvTextCell(column.label)).join(';');
  const rows=records.map(record=>columns.map(column=>column.type==='number'?csvNumberCell(column.get(record)):csvTextCell(column.get(record))).join(';'));
  return '\uFEFF'+[header,...rows].join('\r\n');
}
