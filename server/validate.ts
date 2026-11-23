// Shape checks for every client payload. The server is on the public internet,
// so nothing from a socket is trusted until it passes through here.
import type { HostAction, Settings } from '../shared/types.ts';
import { isThemeId } from './engine.ts';

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isStr = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length <= max;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isId = (v: unknown): v is string => isStr(v, 64) && v.length > 0;
const optStrOrNull = (v: unknown, max = 64) => v === undefined || v === null || isStr(v, max);

export function parseJoin(p: unknown) {
  if (!isObj(p) || !isStr(p.roomCode, 16) || !isStr(p.name, 100)) return null;
  if (p.token !== undefined && !isStr(p.token, 100)) return null;
  if (!optStrOrNull(p.avatar) || !optStrOrNull(p.color)) return null;
  return {
    roomCode: p.roomCode,
    name: p.name,
    token: p.token as string | undefined,
    avatar: (p.avatar as string | null | undefined) ?? null,
    color: (p.color as string | null | undefined) ?? null,
  };
}

export function parseHostAction(a: unknown): HostAction | null {
  if (!isObj(a) || typeof a.type !== 'string') return null;
  switch (a.type) {
    case 'start':
    case 'next':
    case 'nextRound':
    case 'end':
    case 'reset':
    case 'revealSubject':
      return { type: a.type };
    case 'addTime':
      return isNum(a.seconds) ? { type: 'addTime', seconds: a.seconds } : null;
    case 'hideCaption':
      return isId(a.captionId) && typeof a.hidden === 'boolean'
        ? { type: 'hideCaption', captionId: a.captionId, hidden: a.hidden }
        : null;
    case 'kick':
      return isId(a.playerId) ? { type: 'kick', playerId: a.playerId } : null;
    case 'rename':
      return isId(a.playerId) && isStr(a.name, 100) ? { type: 'rename', playerId: a.playerId, name: a.name } : null;
    case 'adjustScore':
      return isId(a.playerId) && isNum(a.delta) ? { type: 'adjustScore', playerId: a.playerId, delta: a.delta } : null;
    case 'reorderPhotos':
      return Array.isArray(a.photoIds) && a.photoIds.length <= 1000 && a.photoIds.every(isId)
        ? { type: 'reorderPhotos', photoIds: a.photoIds as string[] }
        : null;
    case 'setSubject':
      return isId(a.photoId) && (a.subject === null || isStr(a.subject, 200))
        ? { type: 'setSubject', photoId: a.photoId, subject: a.subject as string | null }
        : null;
    case 'removePhoto':
      return isId(a.photoId) ? { type: 'removePhoto', photoId: a.photoId } : null;
    case 'updateSettings': {
      if (!isObj(a.settings)) return null;
      const out: Partial<Settings> = {};
      for (const k of ['captionSeconds', 'voteSeconds', 'maxCaptionLength', 'teamCount'] as const) {
        const v = a.settings[k];
        if (v === undefined) continue;
        if (!isNum(v)) return null;
        out[k] = v;
      }
      if (a.settings.theme !== undefined) {
        if (!isThemeId(a.settings.theme)) return null;
        out.theme = a.settings.theme;
      }
      if (a.settings.teamMode !== undefined) {
        if (typeof a.settings.teamMode !== 'boolean') return null;
        out.teamMode = a.settings.teamMode;
      }
      return { type: 'updateSettings', settings: out };
    }
    case 'moveToTeam':
      return isId(a.playerId) && isId(a.teamId) ? { type: 'moveToTeam', playerId: a.playerId, teamId: a.teamId } : null;
    case 'shuffleTeams':
      return { type: 'shuffleTeams' };
    case 'renameTeam':
      return isId(a.teamId) && isStr(a.name, 100) ? { type: 'renameTeam', teamId: a.teamId, name: a.name } : null;
    default:
      return null;
  }
}
