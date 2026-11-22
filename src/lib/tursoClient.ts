export const TURSO_PIPELINE_URL = 'https://bossa-bossa.aws-sa-east-1.turso.io/v2/pipeline';
export const TURSO_AUTH_TOKEN =
  'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTQ0MjI4ODUsImlkIjoiMDFhMWM2NTMtMTcwMS03ODE4LTg3MTMtYmU2ZjQzODdjMzY0Iiwia2lkIjoiUnpjamJ1bmkxQnZ6SGstZGs0aURzRG9yMm1FeXdLbUkydVBpZF8xQUJ0YyIsInJpZCI6IjQ1ZWQzODljLWMxZjMtNDM2My1hZWFiLTA2YzVlMmIzY2NhYyJ9.92VoxZjBJEzg5Y3yU8pWVF3_eM6i3uRfp7S1T2Zw-Blt_2K1tiCiOVxy03nV54gPn4gRtjMbVl4USFlSXyLyAw';

export interface TursoStatement {
  sql: string;
  args?: any[];
}

function formatTursoArgs(args: any[] = []) {
  return args.map((arg) => {
    if (arg === null || arg === undefined) return { type: 'null' };
    if (typeof arg === 'number') {
      return { type: Number.isInteger(arg) ? 'integer' : 'float', value: String(arg) };
    }
    if (typeof arg === 'boolean') return { type: 'integer', value: arg ? '1' : '0' };
    return { type: 'text', value: String(arg) };
  });
}

// Executa múltiplas instruções no banco Turso em uma única chamada HTTP Pipeline
export async function executeTursoBatch(statements: TursoStatement[]): Promise<any[]> {
  if (statements.length === 0) return [];

  const res = await fetch(TURSO_PIPELINE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TURSO_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: statements.map((stmt) => ({
        type: 'execute',
        stmt: {
          sql: stmt.sql,
          args: formatTursoArgs(stmt.args || []),
        },
      })),
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Falha no banco Turso (${res.status}): ${txt}`);
  }

  const data = await res.json();
  const results = Array.isArray(data?.results) ? data.results : [];

  for (const item of results) {
    if (item?.type === 'error') {
      throw new Error(item.error?.message || 'Erro ao executar comando no banco Turso');
    }
  }

  return results.map((item: any) => item?.response?.result);
}

// Execução direta e resiliente no banco Turso via REST Pipeline (Funciona no Vercel, Netlify e Localhost)
export async function executeTursoDirect(sql: string, args: any[] = []): Promise<any> {
  const results = await executeTursoBatch([{ sql, args }]);
  return results[0];
}
