import { problem } from '@/lib/api';
import { SponsorError } from './service';

const STATUS: Record<SponsorError['code'], number> = { bad_input: 400, policy: 422, not_found: 404, not_reviewable: 409, gates: 409, insufficient_points: 402, empty: 409, needs_wallet: 401, locked: 403 };
export const sponsorProblem = (e: SponsorError) => problem(STATUS[e.code], e.code, e.message);
