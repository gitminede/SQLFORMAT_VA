const input = document.getElementById('input');
const output = document.getElementById('output');
const formatBtn = document.getElementById('format');
const downloadBtn = document.getElementById('download');

input.value = `CREATE TABLE dbo.Example (
  ID INT NOT NULL,
  Name VARCHAR(50) NULL,
  CONSTRAINT PK_Example PRIMARY KEY (ID)
)

SELECT a.Id AS item_id, a.Name AS item_name, IIF(a.Flag=1,'Y','N') AS is_active
FROM dbo.Items WITH (NOLOCK)
LEFT JOIN dbo.ItemChild c WITH (NOLOCK)
ON a.Id = c.ItemId
AND c.Active = 1
WHERE a.Active = 1
ORDER BY a.Name, a.Id`;

async function formatSql() {
  const res = await fetch('/api/format', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: input.value })
  });
  const data = await res.json();
  output.value = data.formatted || '';
}

async function downloadArtifact() {
  if (!output.value.trim()) {
    await formatSql();
  }

  const res = await fetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: input.value, filename: 'formatted.sql' })
  });

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'formatted.sql';
  a.click();
  URL.revokeObjectURL(url);
}

formatBtn.addEventListener('click', formatSql);
downloadBtn.addEventListener('click', downloadArtifact);
