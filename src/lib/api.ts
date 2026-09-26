import { NextResponse } from 'next/server';
import { RollError } from '@/modules/rolls/service';

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === 'number' ? { status: init } : init);
}

export function problem(status: number, code: string, message: string, detail?: unknown) {
  return NextResponse.json({ error: { code, message, detail } }, { status });
}

const ROLL_STATUS: Record<RollError['code'], number> = {
  case_not_found: 404, case_needs_points: 402, no_pool: 409, pool_too_small: 422, rate_limited: 429, no_actor: 400,
};

/** Maps known domain errors to HTTP problems; anything else is a 500 without internals. */
export function handleError(e: unknown) {
  if (e instanceof RollError) return problem(ROLL_STATUS[e.code], e.code, e.message, e.detail);
  if (e instanceof SyntaxError) return problem(400, 'bad_json', 'request body is not valid JSON');
  console.error(e);
  return problem(500, 'internal', 'something went wrong');
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  const text = await req.text();
  return (text ? JSON.parse(text) : {}) as T;
}
