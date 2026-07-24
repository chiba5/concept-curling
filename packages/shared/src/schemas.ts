import { z } from 'zod';
import { CONFIG_LIMITS, MAX_CONCEPT_LENGTH, MAX_NAME_LENGTH, ROOM_ID_LENGTH } from './constants.js';

/** 概念・名前に共通: トリム後 1 文字以上、制御文字なし */
const cleanString = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1)
        .max(max)
        // eslint-disable-next-line no-control-regex
        .regex(/^[^\u0000-\u001f\u007f]+$/),
    );

export const conceptSchema = cleanString(MAX_CONCEPT_LENGTH);
export const nameSchema = cleanString(MAX_NAME_LENGTH);

export const gameConfigSchema = z
  .object({
    playerCount: z
      .number()
      .int()
      .min(CONFIG_LIMITS.playerCount.min)
      .max(CONFIG_LIMITS.playerCount.max),
    conceptsPerPlayer: z
      .number()
      .int()
      .min(CONFIG_LIMITS.conceptsPerPlayer.min)
      .max(CONFIG_LIMITS.conceptsPerPlayer.max),
    maxLives: z.number().int().min(1),
    pickMinTotal: z.number().int().min(0),
    destroyThreshold: z.number().int().min(0).max(99),
    allSecret: z.boolean(),
    themes: z.object({
      count: z.number().int().min(CONFIG_LIMITS.themesCount.min).max(CONFIG_LIMITS.themesCount.max),
      mode: z.enum(['llm', 'manual']),
      manual: z.array(conceptSchema).optional(),
    }),
    graceSeconds: z
      .number()
      .int()
      .min(CONFIG_LIMITS.graceSeconds.min)
      .max(CONFIG_LIMITS.graceSeconds.max),
  })
  .refine((c) => c.maxLives < c.conceptsPerPlayer, {
    message: 'maxLives は conceptsPerPlayer 未満',
  })
  .refine((c) => c.pickMinTotal <= c.themes.count * 100, {
    message: 'pickMinTotal はテーマ数 × 100 以下',
  })
  .refine((c) => c.themes.mode !== 'manual' || c.themes.manual?.length === c.themes.count, {
    message: 'manual テーマは count 個ちょうど',
  });

export const roomIdSchema = z
  .string()
  .length(ROOM_ID_LENGTH)
  .regex(/^[A-Z0-9]+$/);

export const createRoomSchema = z.object({ name: nameSchema, config: gameConfigSchema });
export const joinRoomSchema = z.object({
  roomId: roomIdSchema,
  name: nameSchema,
  playerToken: z.string().uuid().optional(),
});
export const submitConceptsSchema = z.object({ concepts: z.array(conceptSchema) });
export const pickLivesSchema = z
  .object({
    selectedIndices: z.array(z.number().int().min(0)).min(1),
    secretIndexes: z.array(z.number().int().min(0)).min(1),
  })
  .refine((p) => new Set(p.selectedIndices).size === p.selectedIndices.length, {
    message: 'selectedIndices が重複',
  })
  .refine((p) => new Set(p.secretIndexes).size === p.secretIndexes.length, {
    message: 'secretIndexes が重複',
  })
  .refine((p) => p.secretIndexes.every((i) => p.selectedIndices.includes(i)), {
    message: 'secretIndexes は selectedIndices の部分集合であること',
  });
export const attackSchema = z.object({ concept: conceptSchema });
