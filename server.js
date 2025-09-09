// server.js (CommonJS)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

// .env から読み込み
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 採点エンドポイント
app.post('/score', async (req, res) => {
  const { system, user } = req.body || {};
  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system || '' },
        { role: 'user', content: user || '' },
      ],
      response_format: { type: 'json_object' },
    });
    // LLM のJSON文字列をそのまま返す（文字列/オブジェクトどちらでもOK）
    const content = completion.choices?.[0]?.message?.content || '{}';
    res.type('application/json').send(content);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// 静的ファイルを配信（index.html 等を public/ に置いた場合）
app.use(express.static('public'));

// 動作確認用
app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});
