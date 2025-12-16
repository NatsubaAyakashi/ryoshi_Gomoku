import { BoardState, Player } from '../types/game';
import { BOARD_SIZE } from './constants';

/**
 * 盤面をチェックして勝利したプレイヤーを判定する
 * @param board - 現在の盤面状態
 * @returns 勝利したプレイヤー、もしくは誰も勝利していなければnull
 */
export const checkWin = (board: BoardState): Player | null => {
  // 探索する4つの方向（横、縦、右下がり斜め、左下がり斜め）
  const directions = [
    { r: 0, c: 1 }, // Horizontal
    { r: 1, c: 0 }, // Vertical
    { r: 1, c: 1 }, // Diagonal (\)
    { r: 1, c: -1 }, // Anti-diagonal (/)
  ];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      // 観測済みの石でなければチェックしない
      if (!cell?.observedColor) {
        continue;
      }

      const player = cell.observedColor;

      for (const dir of directions) {
        let count = 1;
        // 正の方向
        for (let i = 1; i < 5; i++) {
          const nextR = r + dir.r * i;
          const nextC = c + dir.c * i;
          if (
            nextR >= 0 && nextR < BOARD_SIZE &&
            nextC >= 0 && nextC < BOARD_SIZE &&
            board[nextR][nextC]?.observedColor === player
          ) {
            count++;
          } else {
            break;
          }
        }
        
        // 5つ以上並んでいれば勝利
        if (count >= 5) {
          return player;
        }
      }
    }
  }

  // 勝者なし
  return null;
};

/**
 * CPUの次の一手を決定する
 * 戦略: 中央寄り、かつ既存の石の隣を優先する
 */
export const getCpuMove = (board: BoardState): { r: number, c: number } | null => {
  const size = board.length;
  const center = Math.floor(size / 2);
  
  let bestMoves: { r: number, c: number }[] = [];
  let maxScore = -Infinity;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== null) continue;

      let score = 0;

      // 1. 中央に近いほど高評価 (マンハッタン距離の逆)
      const dist = Math.abs(r - center) + Math.abs(c - center);
      score -= dist; 

      // 2. 周囲に石があるほど高評価（隣接ボーナス）
      // これにより、石が密集している場所（戦場）を選びやすくなる
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
            if (board[nr][nc] !== null) {
              score += 8; // 隣接ボーナス（距離スコアより重くする）
            }
          }
        }
      }

      if (score > maxScore) {
        maxScore = score;
        bestMoves = [{ r, c }];
      } else if (score === maxScore) {
        bestMoves.push({ r, c });
      }
    }
  }

  if (bestMoves.length === 0) return null;
  
  // 同じスコアの候補からランダムに選ぶ
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
};
