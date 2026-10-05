const subitemId = process.argv[2];
if (!/^\d+$/.test(subitemId ?? '')) throw new Error('Usage: firebase functions:secrets:access MONDAY_API_TOKEN | node scripts/verify-monday-subitem-status-readonly.mjs <subitemId>');

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const token = Buffer.concat(chunks).toString('utf8').trim();
if (!token) throw new Error('MONDAY_API_TOKEN_REQUIRED_ON_STDIN');

const { updateSubitemStatus } = await import('../functions/lib/mondayUpdateSubitemStatus.js');
const result = await updateSubitemStatus(token, { subitemId, novoStatus: 'NAO_INICIADA', dryRun: true });
if (result.result !== 'NO_CHANGE') throw new Error(`UNEXPECTED_READ_ONLY_RESULT_${result.result}`);
console.log(JSON.stringify({
  subitemId: result.subitemId,
  labelId: result.statusAtual.labelId,
  label: result.statusAtual.label,
  domainResolved: result.statusAtual.code,
  mutationExecuted: 0,
}, null, 2));
