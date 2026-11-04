import { Router } from "express";
import { pool } from "../db";
import { config } from "../config";
import { askAuth } from "../middleware/tokenAuth";
import { ask } from "../services/rag";
import { biayaUntuk } from "../lib/harga";

const router = Router();

router.post("/ask", askAuth, async (req, res) => {
  const question = String(req.body?.question ?? "").trim();
  if (!question) return res.status(400).json({ error: "question required" });

  const started = Date.now();
  const result = await ask(question);
  const latency_ms = Date.now() - started;

  const model = result.model ?? config.openaiModel;
  const biaya = await biayaUntuk(model, result.tokenIn, result.tokenOut);

  await pool.query(
    `INSERT INTO usage_logs
       (token_id, user_id, question, answer, cited_chunks, model, latency_ms,
        token_in, token_out, biaya_usd, sumber)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'playground')`,
    [
      req.auth!.tokenId,
      req.auth!.userId,
      question,
      result.answer,
      JSON.stringify(result.citations),
      model,
      latency_ms,
      result.tokenIn ?? null,
      result.tokenOut ?? null,
      biaya,
    ]
  );
  res.json(result);
});

export default router;
