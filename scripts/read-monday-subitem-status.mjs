const subitemId = process.argv[2];
const boardId = process.argv[3] ?? '8615383923';
const statusColumnId = 'color_mknqcdnw';

if (!/^\d+$/.test(subitemId ?? '') || !/^\d+$/.test(boardId)) {
  throw new Error('Usage: firebase functions:secrets:access MONDAY_API_TOKEN | node scripts/read-monday-subitem-status.mjs <subitemId> [boardId]');
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const token = Buffer.concat(chunks).toString('utf8').trim();
if (!token) throw new Error('MONDAY_API_TOKEN_REQUIRED_ON_STDIN');

const query = `query($itemId:ID!,$boardId:ID!){
  items(ids:[$itemId]){
    id name board{id}
    column_values(ids:["${statusColumnId}"]){
      id type text value
      ... on StatusValue { index label is_done }
    }
  }
  boards(ids:[$boardId]){
    id columns(ids:["${statusColumnId}"]){id type settings}
  }
}`;
const response = await fetch('https://api.monday.com/v2', {
  method: 'POST',
  headers: { Authorization: token, 'Content-Type': 'application/json', 'API-Version': '2026-07' },
  body: JSON.stringify({ query, variables: { itemId: subitemId, boardId } }),
});
const payload = await response.json();
if (!response.ok || payload.errors?.length) throw new Error(payload.errors?.map((error) => error.message).join('; ') || `MONDAY_API_${response.status}`);

const item = payload.data.items?.[0] ?? null;
const column = item?.column_values?.find((value) => value?.id === statusColumnId) ?? null;
const schema = payload.data.boards?.[0]?.columns?.find((value) => value?.id === statusColumnId) ?? null;
const settings = typeof schema?.settings === 'string' ? JSON.parse(schema.settings) : schema?.settings;

console.log(JSON.stringify({
  apiVersion: response.headers.get('API-Version') ?? response.headers.get('X-API-Version') ?? null,
  item: item && { id: item.id, name: item.name, boardId: item.board?.id ?? null },
  column: column && { id: column.id, type: column.type, text: column.text, value: column.value, index: column.index ?? null, label: column.label ?? null, is_done: column.is_done ?? null },
  schema: schema && { id: schema.id, type: schema.type, labels: (settings?.labels ?? []).map(({ id, index, label }) => ({ id, index, label })) },
}, null, 2));
