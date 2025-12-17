import { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, Player, BoardState, GameMode } from '../types/game';
import { BOARD_SIZE, STONE_PROBABILITIES } from '../utils/constants';
import { checkWin, getCpuMove } from '../utils/gameLogic';

// 初期状態を生成するヘルパー関数
const createInitialState = (): GameState => ({
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
const performUndo = (currentHistory: GameState[]) => {
  const previousState = currentHistory[currentHistory.length - 1];
  const newHistory = currentHistory.slice(0, -1);
  return { state: previousState, history: newHistory };
};

export const useQuantumGame = () => {
  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [history, setHistory] = useState<GameState[]>([]);
  const timeoutRef = useRef<number | undefined>(undefined);
  const cpuStateRef = useRef<'thinking' | 'placed' | 'observing' | 'reverted'>('thinking');
  const gameStateRef = useRef(gameState);

  // 最新のgameStateをRefに保持（イベントリスナー内で参照するため）
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // ブラウザバックやリロード時の確認ダイアログ
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const state = gameStateRef.current;
      // 盤面に石があるかチェック
      const hasStones = state.board.some(row => row.some(cell => cell !== null));

      if (!state.isGameOver && hasStones) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // コンポーネントのアンマウント時にタイムアウトをクリア
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== undefined) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // 石の種類を選択する処理
  const selectStone = useCallback((index: 0 | 1) => {
    setGameState(prev => ({ ...prev, selectedStoneIndex: index }));
  }, []);

  // 置き間違い防止モードの切り替え
  const toggleConfirmMode = useCallback(() => {
    setGameState(prev => ({ ...prev, confirmPlacementMode: !prev.confirmPlacementMode, pendingStone: null }));
  }, []);

  // 待った（Undo）機能
  const undo = useCallback(() => {
    if (history.length === 0) return;
    
    let { state: nextState, history: nextHistory } = performUndo(history);

    // PvEモードの場合の追加ロジック
    if (gameState.gameMode === 'PvE' && gameState.cpuColor) {
      // 復元した状態がCPUのターン、またはプレイヤーのターンだが石が置かれている（＝ターン終了前）場合は、
      // プレイヤーのターン開始時（石を置く前）になるまで遡る
      while (
        nextHistory.length > 0 &&
        (nextState.currentPlayer === gameState.cpuColor || nextState.isStonePlaced)
      ) {
        const res = performUndo(nextHistory);
        nextState = res.state;
        nextHistory = res.history;
      }
    }

    setHistory(nextHistory);
    setGameState(nextState);

    // タイマーがあればクリア
    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, [history, gameState.gameMode, gameState.cpuColor]);

  // 石を置く処理
  const placeStone = useCallback((row: number, col: number) => {
    setGameState(prev => {
      // ゲームオーバー後、観測中、収縮中、既に石を置いた場合、またはセルに既に石がある場合は何もしない
      if (prev.isGameOver || prev.isObserving || prev.isCollapsing || prev.isStonePlaced || prev.board[row][col]) {
        return prev;
      }

      // 置き間違い防止モードがONの場合の処理
      if (prev.confirmPlacementMode) {
        if (!prev.pendingStone || prev.pendingStone.row !== row || prev.pendingStone.col !== col) {
          return { ...prev, pendingStone: { row, col } };
        }
      }

      // 履歴に保存
      setHistory(h => [...h, prev]);

      const newBoard = prev.board.map(r => [...r]);
      const probability = STONE_PROBABILITIES[prev.currentPlayer][prev.selectedStoneIndex];

      // 新しい石を置く
      newBoard[row][col] = { probability };

      // 最後に置いた石の情報を更新
      const newLastBlack = prev.currentPlayer === 'Black' ? prev.selectedStoneIndex : prev.lastBlackStoneIndex;
      const newLastWhite = prev.currentPlayer === 'White' ? prev.selectedStoneIndex : prev.lastWhiteStoneIndex;

      return {
        ...prev,
        board: newBoard,
        lastBlackStoneIndex: newLastBlack,
        lastWhiteStoneIndex: newLastWhite,
        isStonePlaced: true, // 石を置いたフラグを立てる（ターンはまだ交代しない）
        pendingStone: null,
      };
    });
  }, []);

  // ターン終了処理
  const endTurn = useCallback(() => {
    setGameState(prev => {
      // 履歴に保存
      setHistory(h => [...h, prev]);

      const nextPlayer = prev.currentPlayer === 'Black' ? 'White' : 'Black';

      // 次のプレイヤーのデフォルト選択を決定（制限がある場合は強制的に変更）
      let nextSelected: 0 | 1 = 0;
      if (nextPlayer === 'Black') {
        if (prev.lastBlackStoneIndex === 0) nextSelected = 1;
        else nextSelected = 0;
      } else {
        // 白のデフォルトは10% (index 1)
        if (prev.lastWhiteStoneIndex === 1) nextSelected = 0;
        else nextSelected = 1;
      }

      return {
        ...prev,
        currentPlayer: nextPlayer,
        selectedStoneIndex: nextSelected,
        isStonePlaced: false, // フラグをリセット
      };
    });
  }, []);

  // 観測処理
  const observeBoard = useCallback(() => {
    // 既にゲームオーバーや収縮中の場合は何もしない
    if (gameState.isGameOver || gameState.isCollapsing) return;

    // 石を置いていない場合、または既に観測中（結果表示中）の場合は観測できない
    if (!gameState.isStonePlaced || gameState.isObserving) return;

    // 観測回数のチェック
    const currentCount = gameState.currentPlayer === 'Black' ? gameState.blackObservationCount : gameState.whiteObservationCount;
    if (currentCount <= 0) return;

    // 履歴に保存
    setHistory(h => [...h, gameState]);

    // 観測開始：まずは収縮アニメーションを開始
    setGameState(prev => ({
      ...prev,
      isCollapsing: true,
    }));

    // 既存のタイマーがあればクリア
    if (timeoutRef.current !== undefined) clearTimeout(timeoutRef.current);

    // 1秒後に結果を確定させる
    timeoutRef.current = window.setTimeout(() => {
      setGameState(prev => {
        // リセットなどで状況が変わっていたら中断
        if (!prev.isCollapsing) return prev;

        const observedBoard: BoardState = prev.board.map(row =>
          row.map(cell => {
            if (!cell) return null;
            // 確率に基づいて色を決定
            const observedColor = (Math.random() < cell.probability ? 'Black' : 'White') as Player;
            return { ...cell, observedColor };
          })
        );

        const { winner, winningLine } = checkWin(observedBoard, prev.currentPlayer);

        // 観測回数を減らす
        const newBlackCount = prev.currentPlayer === 'Black' ? prev.blackObservationCount - 1 : prev.blackObservationCount;
        const newWhiteCount = prev.currentPlayer === 'White' ? prev.whiteObservationCount - 1 : prev.whiteObservationCount;

        if (winner) {
          return {
            ...prev,
            board: observedBoard,
            winner: winner,
            isGameOver: true,
            winningLine: winningLine,
            isObserving: false,
            isCollapsing: false,
            showNoWinnerMessage: false,
            blackObservationCount: newBlackCount,
            whiteObservationCount: newWhiteCount,
          };
        } else {
          // 勝負がつかなかった場合 -> 自動で元に戻してターン終了
          timeoutRef.current = window.setTimeout(() => {
            setGameState(prevState => {
              const revertedBoard = prevState.board.map(row =>
                row.map(cell => {
                  if (!cell) return null;
                  return { ...cell, observedColor: undefined };
                })
              );
              return { ...prevState, board: revertedBoard, isObserving: false, isReverting: true, showNoWinnerMessage: false };
            });

            timeoutRef.current = window.setTimeout(() => {
              setGameState(prevState => {
                setHistory(h => [...h, prevState]);
                const nextPlayer = prevState.currentPlayer === 'Black' ? 'White' : 'Black';
                let nextSelected: 0 | 1 = 0;
                if (nextPlayer === 'Black') {
                  if (prevState.lastBlackStoneIndex === 0) nextSelected = 1;
                  else nextSelected = 0;
                } else {
                  if (prevState.lastWhiteStoneIndex === 1) nextSelected = 0;
                  else nextSelected = 1;
                }
                return { ...prevState, isReverting: false, currentPlayer: nextPlayer, selectedStoneIndex: nextSelected, isStonePlaced: false };
              });
              timeoutRef.current = undefined;
            }, 500);
          }, 2000);

          return {
            ...prev,
            board: observedBoard,
            winner: null,
            isGameOver: false,
            winningLine: null,
            isObserving: true,
            isCollapsing: false,
            showNoWinnerMessage: true,
            blackObservationCount: newBlackCount,
            whiteObservationCount: newWhiteCount,
          };
        }
      });
      timeoutRef.current = undefined;
    }, 1000); // 1秒間パラパラさせる

  }, [gameState]);

  // ゲームリセット処理
  const resetGame = useCallback((mode?: GameMode, cpuColor?: Player | null) => {
    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    setGameState(prev => ({
      ...createInitialState(),
      gameMode: mode ?? prev.gameMode, // モード指定がなければ現在のモードを維持
      cpuColor: cpuColor !== undefined ? cpuColor : prev.cpuColor // CPUの色指定
    }));
    setHistory([]);
  }, []);

  // CPUのターン処理
  useEffect(() => {
    // 条件チェック: PvEモード、CPUのターン、ゲーム進行中、アニメーション中でない
    const { gameMode, currentPlayer, cpuColor, isGameOver, isCollapsing, isStonePlaced, isObserving, blackObservationCount, whiteObservationCount } = gameState;

    if (gameMode !== 'PvE' || currentPlayer !== cpuColor || isGameOver || isCollapsing) {
      return;
    }

    let timer: number | undefined;

    // --- フェーズ1: 石を置く ---
    if (!isStonePlaced && !isObserving) {
      // 思考時間（1秒）
      timer = window.setTimeout(() => {
        cpuStateRef.current = 'placed';

        // 履歴に保存
        setHistory(h => [...h, gameState]);

        setGameState(prev => {
          // 1. 石の選択
          const isCpuBlack = prev.currentPlayer === 'Black';
          const lastCpuIndex = isCpuBlack ? prev.lastBlackStoneIndex : prev.lastWhiteStoneIndex;
          let selectedIndex: 0 | 1 = 0;

          if (isCpuBlack) {
             // 黒: 0 (90%) は連続不可
             if (lastCpuIndex === 0) selectedIndex = 1;
             else selectedIndex = Math.random() < 0.5 ? 0 : 1;
          } else {
             // 白: 1 (10%) は連続不可
             if (lastCpuIndex === 1) selectedIndex = 0;
             else selectedIndex = Math.random() < 0.5 ? 0 : 1;
          }

          // 2. 場所の選択 (指向性あり)
          const target = getCpuMove(prev.board);
          if (!target) return prev;

          const newBoard = prev.board.map(r => [...r]);
          const probability = STONE_PROBABILITIES[prev.currentPlayer][selectedIndex];
          newBoard[target.r][target.c] = { probability };

          const newLastBlack = isCpuBlack ? selectedIndex : prev.lastBlackStoneIndex;
          const newLastWhite = !isCpuBlack ? selectedIndex : prev.lastWhiteStoneIndex;

          return {
            ...prev,
            board: newBoard,
            lastBlackStoneIndex: newLastBlack,
            lastWhiteStoneIndex: newLastWhite,
            isStonePlaced: true, // 石を置いた状態にする
          };
        });
      }, 1000);
    }

    // --- フェーズ2: 観測するか決める or ターン終了 ---
    else if (isStonePlaced && !isObserving) {
      // 石を置いた直後なら、観測するか判断
      if (cpuStateRef.current === 'placed') {
        timer = window.setTimeout(() => {
          // 観測回数が残っていて、かつ30%の確率で観測を行う
          const cpuObsCount = currentPlayer === 'Black' ? blackObservationCount : whiteObservationCount;
          if (cpuObsCount > 0 && Math.random() < 0.3) {
            cpuStateRef.current = 'observing';
            observeBoard();
          } else {
            endTurn();
            cpuStateRef.current = 'thinking';
          }
        }, 1000);
      }
    }

    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [gameState, endTurn, observeBoard]); // gameState全体を監視

  return {
    gameState,
    placeStone,
    endTurn,
    selectStone,
    toggleConfirmMode,
    undo,
    observeBoard,
    resetGame,
  };
};
