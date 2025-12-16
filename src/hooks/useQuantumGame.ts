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
});

export const useQuantumGame = () => {
  const [gameState, setGameState] = useState<GameState>(createInitialState);
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

  // メッセージを一定時間後に非表示にする
  useEffect(() => {
    if (gameState.showNoWinnerMessage) {
      const timer = setTimeout(() => {
        setGameState(prev => ({ ...prev, showNoWinnerMessage: false }));
      }, 2000); // 2秒後に消す
      return () => clearTimeout(timer);
    }
  }, [gameState.showNoWinnerMessage]);

  // 石の種類を選択する処理
  const selectStone = useCallback((index: 0 | 1) => {
    setGameState(prev => ({ ...prev, selectedStoneIndex: index }));
  }, []);

  // 置き間違い防止モードの切り替え
  const toggleConfirmMode = useCallback(() => {
    setGameState(prev => ({ ...prev, confirmPlacementMode: !prev.confirmPlacementMode, pendingStone: null }));
  }, []);

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
      const nextPlayer = prev.currentPlayer === 'Black' ? 'White' : 'Black';

      // 次のプレイヤーのデフォルト選択を決定（制限がある場合は強制的に変更）
      let nextSelected: 0 | 1 = 0;
      if (nextPlayer === 'Black' && prev.lastBlackStoneIndex === 0) {
        nextSelected = 1;
      } else if (nextPlayer === 'White' && prev.lastWhiteStoneIndex === 1) {
        nextSelected = 0;
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

    // 石を置いていない場合は観測できない（元に戻す操作は除く）
    if (!gameState.isStonePlaced && !gameState.isObserving) return;

    // 既に観測中で勝負がついていない場合、元に戻す（確率状態への復帰）
    if (gameState.isObserving) {
      setGameState(prev => {
        const revertedBoard = prev.board.map(row =>
          row.map(cell => {
            if (!cell) return null;
            return { ...cell, observedColor: undefined };
          })
        );
        return { ...prev, board: revertedBoard, isObserving: false };
      });
      return;
    }

    // 観測回数のチェック
    const currentCount = gameState.currentPlayer === 'Black' ? gameState.blackObservationCount : gameState.whiteObservationCount;
    if (currentCount <= 0) return;

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

        const winner = checkWin(observedBoard);

        // 観測回数を減らす
        const newBlackCount = prev.currentPlayer === 'Black' ? prev.blackObservationCount - 1 : prev.blackObservationCount;
        const newWhiteCount = prev.currentPlayer === 'White' ? prev.whiteObservationCount - 1 : prev.whiteObservationCount;

        return {
          ...prev,
          board: observedBoard,
          winner: winner,
          isGameOver: winner !== null,
          // 勝負がつかなければ観測中フラグを立てる
          isObserving: winner === null,
          // アニメーション終了
          isCollapsing: false,
          showNoWinnerMessage: winner === null,
          blackObservationCount: newBlackCount,
          whiteObservationCount: newWhiteCount,
        };
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
  }, []);

  // CPUのターン処理
  useEffect(() => {
    // 条件チェック: PvEモード、CPUのターン、ゲーム進行中、アニメーション中でない
    if (gameState.gameMode !== 'PvE' || gameState.currentPlayer !== gameState.cpuColor || gameState.isGameOver || gameState.isCollapsing) {
      return;
    }

    let timer: number | undefined;

    // --- フェーズ1: 石を置く ---
    if (!gameState.isStonePlaced && !gameState.isObserving) {
      // 思考時間（1秒）
      timer = window.setTimeout(() => {
        cpuStateRef.current = 'placed';

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
    else if (gameState.isStonePlaced && !gameState.isObserving) {
      // 観測から戻ってきた直後なら、即座にターン終了
      if (cpuStateRef.current === 'reverted') {
        timer = window.setTimeout(() => {
          endTurn();
          cpuStateRef.current = 'thinking';
        }, 500);
      } 
      // 石を置いた直後なら、観測するか判断
      else if (cpuStateRef.current === 'placed') {
        timer = window.setTimeout(() => {
          // 観測回数が残っていて、かつ30%の確率で観測を行う
          const cpuObsCount = gameState.currentPlayer === 'Black' ? gameState.blackObservationCount : gameState.whiteObservationCount;
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

    // --- フェーズ3: 観測結果の確認（勝負がつかなかった場合） ---
    else if (gameState.isObserving) {
      // 自分が観測を実行した状態なら、元に戻す
      if (cpuStateRef.current === 'observing') {
        timer = window.setTimeout(() => {
          cpuStateRef.current = 'reverted';
          observeBoard(); // 元に戻す
        }, 1500); // 結果を少し見せてから戻す
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
    observeBoard,
    resetGame,
  };
};
