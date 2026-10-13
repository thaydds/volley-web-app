export type WinnerSide = 'A' | 'B';

/** Partida registrada: foto dos nomes no momento da confirmação (sem vínculo vivo). */
export interface Match {
  number: number;
  /** Data em DD/MM/AAAA (BR4.2). */
  date: string;
  teamA: string[];
  teamB: string[];
  /** Nulo = sem pontuação (C3). */
  winner: WinnerSide | null;
}
