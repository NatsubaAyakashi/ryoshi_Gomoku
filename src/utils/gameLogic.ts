import { BoardState, Player, GameState } from '../types/game';
import { BOARD_SIZE } from './constants';

// 初期状態を生成するヘルパー関数
export const createInitialState = (): GameState => ({
  board: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)),
  gameMode: 'PvP',
  cpuColor: null,
  currentPlayer: 'Black',
  selectedStoneIndex: 0,
  lastBlackStoneIndex: null,
  lastWhiteStoneIndex: null,
  blackObservationCount: 5,
  whiteObservationCount: 5,
  isStonePlaced: false,
  winner: null,
  isGameOver: false,
  isObserving: false,
  isCollapsing: false,
  showNoWinnerMessage: false,
  confirmPlacementMode: false,
  pendingStone: null,
  winningLine: null,
  isReverting: false,
});

// 1回分のUndoを行うヘルパー関数（純粋関数）
export const performUndo = (currentHistory: GameState[]) => {
  const previousState = currentHistory[currentHistory.length - 1];
  const newHistory = currentHistory.slice(0, -1);
  return { state: previousState, history: newHistory };
};

// 次のターンの状態を計算するヘルパー関数
export const calculateNextTurnState = (currentState: GameState): Partial<GameState> => {
  const nextPlayer = currentState.currentPlayer === 'Black' ? 'White' : 'Black';

  // 次のプレイヤーのデフォルト選択を決定（制限がある場合は強制的に変更）
  let nextSelected: 0 | 1 = 0;
  if (nextPlayer === 'Black') {
    if (currentState.lastBlackStoneIndex === 0) nextSelected = 1;
    else nextSelected = 0;
  } else {
    // 白のデフォルトは10% (index 1)
    if (currentState.lastWhiteStoneIndex === 1) nextSelected = 0;
    else nextSelected = 1;
  }

  return {
    currentPlayer: nextPlayer,
    selectedStoneIndex: nextSelected,
    isStonePlaced: false, // フラグをリセット
  };
};

/**
 * 盤面をチェックして勝利したプレイヤーを判定する
 * @param board - 現在の盤面状態
 * @param observer - 観測を行ったプレイヤー（両者勝利時の優先勝者）
 * @returns 勝利したプレイヤー、もしくは誰も勝利していなければnull
 */
export const checkWin = (board: BoardState, observer?: Player): { winner: Player | null, winningLine: { row: number, col: number }[] | null } => {
  // 探索する4つの方向（横、縦、右下がり斜め、左下がり斜め）
  const directions = [
    { r: 0, c: 1 }, // Horizontal
    { r: 1, c: 0 }, // Vertical
    { r: 1, c: 1 }, // Diagonal (\)
    { r: 1, c: -1 }, // Anti-diagonal (/)
  ];

  let blackWins = false;
  let whiteWins = false;
  let blackLines: { row: number, col: number }[] = [];
  let whiteLines: { row: number, col: number }[] = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      // 観測済みの石でなければチェックしない
      if (!cell?.observedColor) {
        continue;
      }

      const player = cell.observedColor;
      // 既に勝利判定済みのプレイヤーならスキップ（ただし相手の勝利確認のためループは続行）
      if (player === 'Black' && blackWins) continue;
      if (player === 'White' && whiteWins) continue;

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
          const line = [];
          for (let k = 0; k < 5; k++) {
            line.push({ row: r + dir.r * k, col: c + dir.c * k });
          }

          if (player === 'Black') {
            blackWins = true;
            blackLines.push(...line);
          }
          if (player === 'White') {
            whiteWins = true;
            whiteLines.push(...line);
          }
        }
      }
    }
    // 両者勝利が確定したらループを抜ける
    if (blackWins && whiteWins) break;
  }

  let winner: Player | null = null;
  let winningLine: { row: number, col: number }[] | null = null;

  if (blackWins && whiteWins) {
    // 両者勝利の場合は観測者（権利を行使した人）の勝ち
    winner = observer || null;
  } else if (blackWins) {
    winner = 'Black';
  } else if (whiteWins) {
    winner = 'White';
  }

  if (winner === 'Black') winningLine = blackLines;
  if (winner === 'White') winningLine = whiteLines;

  return { winner, winningLine };
};

/**
 * CPUの次の一手を決定する
 * 戦略: 自分の勝利ラインを作りつつ、相手の勝利ラインを阻止する
 */
export const getCpuMove = (board: BoardState, cpuColor: Player): { r: number, c: number } | null => {
  const size = board.length;
  let bestMoves: { r: number, c: number }[] = [];
  let maxScore = -Infinity;

  // 評価用重み
  const ATTACK_WEIGHT = 1.0;
  const DEFENSE_WEIGHT = 1.2; // 負けないことを少し優先

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== null) continue;

      // 攻撃スコア（自分の並び）と防御スコア（相手の並び）を計算
      const attackScore = evaluatePoint(board, r, c, cpuColor, true);
      const defenseScore = evaluatePoint(board, r, c, cpuColor, false);

      // 総合スコア
      let score = attackScore * ATTACK_WEIGHT + defenseScore * DEFENSE_WEIGHT;

      // 中央に近いほどわずかに加点（序盤の指針として、また同点時のブレイク用）
      const center = Math.floor(size / 2);
      const dist = Math.abs(r - center) + Math.abs(c - center);
      score += (10 - dist) * 0.1;

      if (score > maxScore) {
        maxScore = score;
        bestMoves = [{ r, c }];
      } else if (Math.abs(score - maxScore) < 0.001) {
        bestMoves.push({ r, c });
      }
    }
  }

  if (bestMoves.length === 0) return null;
  
  // 同じスコアの候補からランダムに選ぶ
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
};

/**
 * 指定した点における、特定のプレイヤーにとっての重要度（並び具合）を評価
 */
const evaluatePoint = (board: BoardState, r: number, c: number, me: Player, isAttack: boolean): number => {
  const size = board.length;
  const directions = [
    { dr: 0, dc: 1 },  // 横
    { dr: 1, dc: 0 },  // 縦
    { dr: 1, dc: 1 },  // 斜め
    { dr: 1, dc: -1 }  // 逆斜め
  ];

  let totalScore = 0;

  // 評価対象の色（攻撃なら自分、防御なら相手）
  const targetColor = isAttack ? me : (me === 'Black' ? 'White' : 'Black');

  for (const { dr, dc } of directions) {
    let lineScore = 0;
    
    // ここに石を置くと仮定するので、中心は 1.0 (確率100%の石相当) とする
    let currentProbSum = 1.0; 
    let stoneCount = 1;

    // 正方向と負方向の石の強さを調べる
    for (const sign of [1, -1]) {
      for (let i = 1; i < 5; i++) {
        const nr = r + dr * i * sign;
        const nc = c + dc * i * sign;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
        
        const cell = board[nr][nc];
        if (!cell) break; // 空きマスでストップ（飛び石は今回は考慮しない簡易版）

        // その石がターゲット色である確率
        const prob = targetColor === 'Black' ? cell.probability : (1 - cell.probability);
        
        // ターゲット色である確率が低い（相手の石っぽい）場合は連続とみなさない
        if (prob < 0.4) break; 

        currentProbSum += prob;
        stoneCount++;
      }
    }

    // スコア付け
    if (stoneCount >= 5) lineScore += 10000 * currentProbSum; // 5個並ぶ -> 勝利確定/敗北阻止
    else if (stoneCount === 4) lineScore += 1000 * currentProbSum; // 4個並ぶ -> リーチ
    else if (stoneCount === 3) lineScore += 100 * currentProbSum; // 3個並ぶ
    else if (stoneCount === 2) lineScore += 10 * currentProbSum; // 2個並ぶ

    totalScore += lineScore;
  }

  return totalScore;
};

/**
 * CPUが観測を行うべきかどうかを判定する
 * 戦略: 自分の色が5つ並ぶ確率が高いラインがあれば観測する
 */
export const shouldCpuObserve = (board: BoardState, cpuColor: Player, observationCount: number): boolean => {
  if (observationCount <= 0) return false;

  const size = board.length;
  let maxWinProb = 0;

  const directions = [
    { r: 0, c: 1 },
    { r: 1, c: 0 },
    { r: 1, c: 1 },
    { r: 1, c: -1 },
  ];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const dir of directions) {
        let lineProb = 1;
        let stoneCount = 0;
        
        for (let i = 0; i < 5; i++) {
          const nr = r + dir.r * i;
          const nc = c + dir.c * i;
          
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) {
            lineProb = 0;
            break;
          }

          const cell = board[nr][nc];
          if (!cell) {
            lineProb = 0;
            break;
          }

          stoneCount++;
          const probBlack = cell.probability;
          const probCpu = cpuColor === 'Black' ? probBlack : (1 - probBlack);
          lineProb *= probCpu;
        }

        if (stoneCount === 5) {
          if (lineProb > maxWinProb) {
            maxWinProb = lineProb;
          }
        }
      }
    }
  }

  // 勝利確率が高いほど観測しやすくなる
  if (maxWinProb > 0.8) return Math.random() < 0.95; // 80%超ならほぼ確実に観測
  if (maxWinProb > 0.5) return Math.random() < 0.80; // 50%超なら高確率で観測
  if (maxWinProb > 0.2) {
      // 20%超なら、残り回数に余裕があればたまに観測
      return observationCount >= 3 ? Math.random() < 0.4 : Math.random() < 0.1;
  }

  // 勝ち目が薄い場合はごく稀に観測（気まぐれやブラフ）
  return Math.random() < 0.02;
};
