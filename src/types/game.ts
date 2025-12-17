// ゲームモード
export type GameMode = 'PvP' | 'PvE' | 'Online';

// プレイヤーの種類
export type Player = 'Black' | 'White';

// 石の状態
export interface Stone {
  // 黒である確率 (0 to 1)
  probability: number;
  // 観測後の確定した色
  observedColor?: Player;
}

// 各セルの状態。石がない場合はnull
export type CellState = Stone | null;

// 盤面全体の状態
export type BoardState = CellState[][];

// ゲーム全体のステート
export interface GameState {
  board: BoardState;
  // 現在のゲームモード
  gameMode: GameMode;
  // PvE時のCPUの色（nullならPvP）
  cpuColor: Player | null;
  currentPlayer: Player;
  // 現在選択されている石のインデックス
  selectedStoneIndex: 0 | 1;
  // 各プレイヤーが最後に置いた石のインデックス（連続制限用）
  lastBlackStoneIndex: 0 | 1 | null;
  lastWhiteStoneIndex: 0 | 1 | null;
  winner: Player | null;
  // 残りの観測回数
  blackObservationCount: number;
  whiteObservationCount: number;
  // そのターンで石を置いたかどうか
  isStonePlaced: boolean;
  isGameOver: boolean;
  // 観測中（結果表示中）かどうか
  isObserving: boolean;
  // 波動関数の収縮中（アニメーション中）かどうか
  isCollapsing: boolean;
  // 勝負がつかなかった場合のメッセージ表示フラグ
  showNoWinnerMessage: boolean;
  // 設定: 置き間違い防止モード
  confirmPlacementMode: boolean;
  // 確定待ちの石の位置
  pendingStone: { row: number, col: number } | null;
  // 勝利ラインの座標
  winningLine: { row: number, col: number }[] | null;
  // 盤面復元アニメーション中かどうか
  isReverting: boolean;
  // オンライン対戦の状態 ('waiting' | 'playing' など)
  status?: string;
  // オンライン対戦のホストの色
  hostColor?: Player | null;
}
