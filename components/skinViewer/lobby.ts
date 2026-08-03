type LobbyStaging = { ani?: string; face?: string };
type LobbyPhase = { active: string | null; boring: string | null };

/** Resolve the staging tags embedded in one lobby line against the current rig. */
export function lobbyBodyAnimation(
  row: LobbyStaging, phase: LobbyPhase, animations: string[],
): string | null {
  if (!row.ani) return null;
  if (row.ani === 'active') return phase.active;
  if (row.ani === 'idle_boring') return phase.boring;
  const lower = row.ani.toLowerCase();
  return animations.find((animation) => animation.toLowerCase() === lower
    || animation.toLowerCase() === `00_${lower}`
    || animation.toLowerCase().endsWith(`/${lower}`)) ?? null;
}

export function lobbyFaceAnimation(
  row: LobbyStaging, animations: string[],
): string | null {
  if (!row.face) return null;
  const lower = row.face.toLowerCase();
  return animations.find((animation) => animation.toLowerCase() === `01_${lower}`
    || animation.toLowerCase().endsWith(`/${lower}`)) ?? null;
}
