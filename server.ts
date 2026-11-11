import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));

// Turso configuration
const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL || 'libsql://bossa-bossa.aws-sa-east-1.turso.io';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTQ0MjI4ODUsImlkIjoiMDFhMWM2NTMtMTcwMS03ODE4LTg3MTMtYmU2ZjQzODdjMzY0Iiwia2lkIjoiUnpjamJ1bmkxQnZ6SGstZGs0aURzRG9yMm1FeXdLbUkydVBpZF8xQUJ0YyIsInJpZCI6IjQ1ZWQzODljLWMxZjMtNDM2My1hZWFiLTA2YzVlMmIzY2NhYyJ9.92VoxZjBJEzg5Y3yU8pWVF3_eM6i3uRfp7S1T2Zw-Blt_2K1tiCiOVxy03nV54gPn4gRtjMbVl4USFlSXyLyAw';

let tursoClient: ReturnType<typeof createClient> | null = null;

function getTursoClient() {
  if (!tursoClient) {
    tursoClient = createClient({
      url: TURSO_DATABASE_URL,
      authToken: TURSO_AUTH_TOKEN,
    });
  }
  return tursoClient;
}

// Ensure the studio_deliveries table exists in the bossa database
async function initBossaDatabase() {
  try {
    const client = getTursoClient();
    await client.execute(`
      CREATE TABLE IF NOT EXISTS studio_deliveries (
        id TEXT PRIMARY KEY,
        order_id TEXT,
        chat_id TEXT,
        client_name TEXT,
        client_phone TEXT,
        title TEXT,
        media_type TEXT, -- 'audio' | 'video' | 'flyer'
        preview_url TEXT NOT NULL,
        preview_name TEXT,
        final_download_url TEXT,
        final_download_name TEXT,
        audio_duration INTEGER DEFAULT 0,
        price REAL DEFAULT 0,
        paid INTEGER DEFAULT 0,
        download_unlocked INTEGER DEFAULT 0,
        unlocked_at TEXT,
        unlocked_by TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    console.log('✅ [Turso bossa] Tabela studio_deliveries verificada/criada com sucesso no Turso!');
  } catch (err) {
    console.error('⚠️ [Turso bossa] Erro ao inicializar tabela:', err);
  }
}

initBossaDatabase();

// ==========================================
// API ROUTES PARA A PRODUTORA BOSSA (TURSO)
// ==========================================

// 1. Health check & status da conexão Turso
app.get('/api/studio/status', async (_req, res) => {
  try {
    const client = getTursoClient();
    const result = await client.execute('SELECT 1 as connected');
    const tableCheck = await client.execute("SELECT count(*) as total FROM studio_deliveries");
    return res.json({
      ok: true,
      database: 'bossa',
      provider: 'turso-libsql',
      connected: result.rows.length > 0,
      totalDeliveries: Number(tableCheck.rows[0]?.total || 0)
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 2. Salvar nova entrega/prévia de áudio/vídeo/flyer no Turso
app.post('/api/studio/deliveries', async (req, res) => {
  try {
    const {
      id,
      orderId,
      chatId,
      clientName,
      clientPhone,
      title,
      mediaType,
      previewUrl,
      previewName,
      finalDownloadUrl,
      finalDownloadName,
      audioDuration,
      price,
      notes
    } = req.body;

    if (!previewUrl) {
      return res.status(400).json({ error: 'previewUrl é obrigatório' });
    }

    const deliveryId = id || `dlv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const client = getTursoClient();

    await client.execute({
      sql: `
        INSERT INTO studio_deliveries (
          id, order_id, chat_id, client_name, client_phone, title, media_type,
          preview_url, preview_name, final_download_url, final_download_name,
          audio_duration, price, paid, download_unlocked, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
      `,
      args: [
        deliveryId,
        orderId || null,
        chatId || null,
        clientName || null,
        clientPhone || null,
        title || 'Produção de Áudio / Spot',
        mediaType || 'audio',
        previewUrl,
        previewName || 'Previa_Audio.mp3',
        finalDownloadUrl || previewUrl,
        finalDownloadName || previewName || 'Audio_Final.mp3',
        audioDuration || 0,
        price || 0,
        notes || null,
        now,
        now
      ]
    });

    return res.json({
      ok: true,
      deliveryId,
      downloadUnlocked: false,
      message: 'Prévia de estúdio salva no banco Turso da Produtora com sucesso!'
    });
  } catch (err: any) {
    console.error('Erro ao salvar prévia no Turso:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 3. Obter status da entrega / verificar se o download foi liberado
app.get('/api/studio/deliveries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = getTursoClient();
    const result = await client.execute({
      sql: 'SELECT * FROM studio_deliveries WHERE id = ? LIMIT 1',
      args: [id]
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Entrega não encontrada no Turso' });
    }

    const row = result.rows[0];
    const isUnlocked = Boolean(Number(row.download_unlocked));

    return res.json({
      id: row.id,
      orderId: row.order_id,
      chatId: row.chat_id,
      clientName: row.client_name,
      title: row.title,
      mediaType: row.media_type,
      previewUrl: row.preview_url,
      previewName: row.preview_name,
      audioDuration: Number(row.audio_duration || 0),
      price: Number(row.price || 0),
      paid: Boolean(Number(row.paid)),
      downloadUnlocked: isUnlocked,
      // Se não estiver liberado, NÃO expõe a url final de download em alta resolução
      finalDownloadUrl: isUnlocked ? (row.final_download_url || row.preview_url) : null,
      finalDownloadName: row.final_download_name || row.preview_name,
      unlockedAt: row.unlocked_at,
      unlockedBy: row.unlocked_by
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. ATENDENTE ACIONA O BOTÃO: Liberar Download após pagamento (Exclusivo Produtora)
app.post('/api/studio/deliveries/:id/unlock', async (req, res) => {
  try {
    const { id } = req.params;
    const { unlockedBy, finalDownloadUrl, finalDownloadName } = req.body;
    const now = new Date().toISOString();
    const client = getTursoClient();

    let sql = `
      UPDATE studio_deliveries 
      SET download_unlocked = 1, paid = 1, unlocked_at = ?, unlocked_by = ?, updated_at = ?
    `;
    const args: any[] = [now, unlockedBy || 'Produtor / Atendente', now];

    if (finalDownloadUrl) {
      sql += `, final_download_url = ?`;
      args.push(finalDownloadUrl);
    }
    if (finalDownloadName) {
      sql += `, final_download_name = ?`;
      args.push(finalDownloadName);
    }

    sql += ` WHERE id = ?`;
    args.push(id);

    await client.execute({ sql, args });

    // Also update orders table if this was linked to an order
    try {
      await client.execute({
        sql: `UPDATE orders SET download_liberated = 1, status = 'concluido', updated_at = ? WHERE order_id = ?`,
        args: [now, id]
      });
    } catch (e) {}

    return res.json({
      ok: true,
      message: 'Download liberado com sucesso para o cliente no Turso!',
      downloadUnlocked: true,
      unlockedAt: now
    });
  } catch (err: any) {
    console.error('Erro ao liberar download no Turso:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 5. Listar entregas de um determinado chat
app.get('/api/studio/chats/:chatId/deliveries', async (req, res) => {
  try {
    const { chatId } = req.params;
    const client = getTursoClient();
    const result = await client.execute({
      sql: 'SELECT * FROM studio_deliveries WHERE chat_id = ? ORDER BY created_at DESC',
      args: [chatId]
    });

    const deliveries = result.rows.map(row => {
      const isUnlocked = Boolean(Number(row.download_unlocked));
      return {
        id: row.id,
        orderId: row.order_id,
        chatId: row.chat_id,
        clientName: row.client_name,
        title: row.title,
        mediaType: row.media_type,
        previewUrl: row.preview_url,
        previewName: row.preview_name,
        audioDuration: Number(row.audio_duration || 0),
        price: Number(row.price || 0),
        paid: Boolean(Number(row.paid)),
        downloadUnlocked: isUnlocked,
        finalDownloadUrl: isUnlocked ? (row.final_download_url || row.preview_url) : null,
        finalDownloadName: row.final_download_name || row.preview_name,
        unlockedAt: row.unlocked_at,
        unlockedBy: row.unlocked_by,
        createdAt: row.created_at
      };
    });

    return res.json({ ok: true, deliveries });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 6. EXCLUIR PROJETO DO BANCO TURSO (BOSSA) - Deletar um projeto específico
app.delete('/api/studio/deliveries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = getTursoClient();
    await client.execute({
      sql: 'DELETE FROM studio_deliveries WHERE id = ? OR order_id = ?',
      args: [id, id]
    });
    return res.json({ ok: true, message: 'Projeto de áudio/vídeo excluído do banco Turso com sucesso!' });
  } catch (err: any) {
    console.error('Erro ao excluir entrega do Turso:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 7. LIMPEZA TOTAL DE PROJETOS CONCLUÍDOS / ANTIGOS NO BANCO TURSO (BOSSA)
app.post('/api/studio/cleanup', async (req, res) => {
  try {
    const { mode } = req.body; // 'completed' | 'all'
    const client = getTursoClient();

    let sql = 'DELETE FROM studio_deliveries WHERE download_unlocked = 1';
    if (mode === 'all') {
      sql = 'DELETE FROM studio_deliveries';
    }

    const result = await client.execute(sql);
    return res.json({
      ok: true,
      affectedRows: result.rowsAffected,
      message: mode === 'all' 
        ? 'Todos os projetos foram removidos do banco Turso da Produtora!' 
        : 'Todos os projetos já entregues e pagos foram removidos do banco Turso!'
    });
  } catch (err: any) {
    console.error('Erro ao limpar banco Turso:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Start Express with Vite middlewares in Dev
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor CRM AtendePRO com backend Turso rodando na porta ${PORT}`);
  });
}

startServer();
