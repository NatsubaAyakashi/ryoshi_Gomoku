import { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, Player, BoardState, GameMode } from '../types/game';
import { STONE_PROBABILITIES } from '../utils/constants';
import { checkWin, getCpuMove, shouldCpuObserve, createInitialState, performUndo, calculateNextTurnState } from '../utils/gameLogic';
import { db } from '../firebase';
import { ref, set, onValue, update, get, onDisconnect } from 'firebase/database';

export const useQuantumGame = () => {
  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [history, setHistory] = useState<GameState[]>([]);
  const timeoutRef = useRef<number | undefined>(undefined);
  const cpuStateRef = useRef<'thinking' | 'placed' | 'observing'>('thinking');
  const gameStateRef = useRef(gameState);
  const [roomId, setRoomId] = useState<string>('');
  const [myColor, setMyColor] = useState<Player | null>(null);
  const [isOpponentDisconnected, setIsOpponentDisconnected] = useState<boolean>(false);
  const isHostRef = useRef<boolean>(false);

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

  // オンライン: 部屋に参加・作成
  const joinRoom = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const roomRef = ref(db, `rooms/${id}`);
      const snapshot = await get(roomRef);
      
      // 部屋を作成（または上書き）する関数
      const createRoom = async () => {
        const initialState = createInitialState();
        const roomData = {
          ...initialState,
          gameMode: 'Online' as GameMode,
          status: 'waiting', // 待機中
          hostColor: null,
          connections: { host: true } // 初期接続状態
        };
        await set(roomRef, roomData);
        setRoomId(id);
        isHostRef.current = true;
        setMyColor(null); // 対戦相手待ち

        // ローカル状態も即座に更新（同期待ちによる不整合を防ぐ）
        setGameState(prev => ({
          ...prev,
          gameMode: 'Online',
          status: 'waiting'
        }));
      };

      if (!snapshot.exists()) {
        // 部屋が存在しない場合は作成（ホストになる）
        await createRoom();
      } else {
        const data = snapshot.val();
        
        // 待機中の部屋の場合
        if (data.status === 'waiting') {
          // ホストの接続が切れている場合は、部屋を乗っ取る（上書き作成）
          if (!data.connections || !data.connections.host) {
            await createRoom();
          } else {
            // 待機中の部屋に参加（ゲストになる）
            const hostIsBlack = Math.random() < 0.5;
            const hostColor = hostIsBlack ? 'Black' : 'White';
            const guestColor = hostIsBlack ? 'White' : 'Black';
            
            await update(roomRef, {
              status: 'playing',
              hostColor: hostColor
            });
            setRoomId(id);
            setMyColor(guestColor);
            isHostRef.current = false;

            // ローカル状態も即座に更新
            setGameState(prev => ({
              ...prev,
              gameMode: 'Online',
              status: 'playing',
              hostColor: hostColor
            }));
          }
        } else {
          // ゲーム進行中の場合でも、両方のプレイヤーがいない場合は部屋をリセット
          if ((!data.connections?.Black) && (!data.connections?.White)) {
             await createRoom();
             return;
          }
          alert('部屋が満員か、既にゲームが進行中です。');
        }
      }
    } catch (error) {
      console.error("Firebase connection error:", error);
      alert("接続エラーが発生しました。Firebaseの設定(src/firebase.ts)や通信環境を確認してください。");
    }
  }, []);

  // オンライン: 状態の同期
  useEffect(() => {
    if (!roomId) return;
    const roomRef = ref(db, `rooms/${roomId}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Firebaseはnullや空配列を保存しないため、boardがundefinedになる可能性がある
        // データを安全な形式に変換して補完する
        const initialBoard = createInitialState().board;
        const syncedBoard = data.board 
          ? initialBoard.map((row, r) => 
              data.board[r] 
                ? row.map((_, c) => data.board[r][c] || null)
                : row
            )
          : initialBoard;

        // ローカルの設定（置き間違い防止など）は維持しつつ、ゲーム状態を同期
        setGameState(prev => ({ ...data, board: syncedBoard, confirmPlacementMode: prev.confirmPlacementMode }));
        
        // ホストの場合、ゲーム開始時に自分の色を設定
        if (isHostRef.current && data.status === 'playing' && !myColor) {
           setMyColor(data.hostColor);
        }
      }
    });
    return () => unsubscribe();
  }, [roomId, myColor]);

  // オンライン: 接続監視
  useEffect(() => {
    if (!roomId) return;

    const connectedRef = ref(db, '.info/connected');
    let myConnectionRef: any;
    let unsubscribeMy: () => void = () => {};
    
    // 1. 自分の接続状態を管理
    if (myColor) {
      // ゲーム中（色が決定している場合）
      myConnectionRef = ref(db, `rooms/${roomId}/connections/${myColor}`);
    } else if (isHostRef.current) {
      // 待機中のホストの場合
      myConnectionRef = ref(db, `rooms/${roomId}/connections/host`);
    }

    if (myConnectionRef) {
      unsubscribeMy = onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
          set(myConnectionRef, true);
          onDisconnect(myConnectionRef).remove();
        }
      });
    }

    // 2. 相手の接続状態を監視（ゲーム中のみ）
    let unsubscribeOpponent: () => void = () => {};
    let disconnectTimer: number | undefined;

    if (myColor) {
      const opponentColor = myColor === 'Black' ? 'White' : 'Black';
      const opponentConnectionRef = ref(db, `rooms/${roomId}/connections/${opponentColor}`);
      
      unsubscribeOpponent = onValue(opponentConnectionRef, (snap) => {
      if (snap.exists()) {
        if (disconnectTimer !== undefined) {
          clearTimeout(disconnectTimer);
          disconnectTimer = undefined;
        }
        setIsOpponentDisconnected(false);
      } else {
        if (disconnectTimer === undefined) {
          disconnectTimer = window.setTimeout(() => {
            setIsOpponentDisconnected(true);
          }, 3000);
        }
      }
    });
    }

    return () => {
      unsubscribeMy();
      unsubscribeOpponent();
      if (myConnectionRef) set(myConnectionRef, null);
      if (disconnectTimer !== undefined) clearTimeout(disconnectTimer);
    };
  }, [roomId, myColor]);

  // 勝負がつかなかった場合の自動遷移処理 1: 観測結果表示(2秒) -> 元に戻すアニメーション開始
  useEffect(() => {
    if (!gameState.showNoWinnerMessage) return;

    const timer = window.setTimeout(() => {
      const stateAfterObservation = gameStateRef.current;
      const revertedBoard: BoardState = stateAfterObservation.board.map(row =>
        row.map(cell => {
          if (!cell) return null;
          const { observedColor, ...rest } = cell;
          return rest;
        })
      );
      const revertState = { ...stateAfterObservation, board: revertedBoard, isObserving: false, isReverting: true, showNoWinnerMessage: false };
      
      if (stateAfterObservation.gameMode === 'Online') {
         update(ref(db, `rooms/${roomId}`), revertState);
      } else {
         setGameState(revertState);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [gameState.showNoWinnerMessage, roomId]);

  // 勝負がつかなかった場合の自動遷移処理 2: 元に戻すアニメーション(0.5秒) -> ターン終了
  useEffect(() => {
    if (!gameState.isReverting) return;

    const timer = window.setTimeout(() => {
      const stateAfterRevert = gameStateRef.current;
      const nextTurnPartialState = calculateNextTurnState(stateAfterRevert);
      const nextTurnState = { 
          ...stateAfterRevert, 
          isReverting: false, 
          ...nextTurnPartialState 
      };
      
      if (stateAfterRevert.gameMode === 'Online') {
          update(ref(db, `rooms/${roomId}`), nextTurnState);
      } else {
          setGameState(nextTurnState);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [gameState.isReverting, roomId]);

  // 現在の状態から「自分の色」を推定するヘルパー関数
  const getEffectiveMyColor = useCallback((currentState: GameState) => {
    if (myColor) return myColor;
    if (currentState.gameMode === 'Online' && currentState.hostColor) {
      if (isHostRef.current) return currentState.hostColor;
      return currentState.hostColor === 'Black' ? 'White' : 'Black';
    }
    return null;
  }, [myColor]);

  // 石の種類を選択する処理
  const selectStone = useCallback((index: 0 | 1) => {
    const prev = gameStateRef.current;
    const effectiveColor = getEffectiveMyColor(prev);

    // オンラインの場合、自分のターンでなければ操作不可
    if (prev.gameMode === 'Online' && prev.currentPlayer !== effectiveColor) {
      return;
    }
    setGameState(prev => ({ ...prev, selectedStoneIndex: index }));
  }, [myColor]);

  // 置き間違い防止モードの切り替え
  const toggleConfirmMode = useCallback(() => {
    setGameState(prev => ({ ...prev, confirmPlacementMode: !prev.confirmPlacementMode, pendingStone: null }));
  }, []);

  // 待った（Undo）機能
  const undo = useCallback(() => {
    // オンラインモードでは「待った」無効
    if (gameState.gameMode === 'Online') return;
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

    // CPUの状態をリセット
    cpuStateRef.current = 'thinking';

    // タイマーがあればクリア
    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, [history, gameState.gameMode, gameState.cpuColor]);

  // 石を置く処理
  const placeStone = useCallback((row: number, col: number) => {
    const prev = gameStateRef.current;

    const effectiveMyColor = getEffectiveMyColor(prev);

    // オンラインの場合、自分のターンでなければ操作不可
    if (prev.gameMode === 'Online' && prev.currentPlayer !== effectiveMyColor) {
      return;
    }

    // ゲームオーバー後、観測中、収縮中、既に石を置いた場合、またはセルに既に石がある場合は何もしない
    if (prev.isGameOver || prev.isObserving || prev.isCollapsing || prev.isStonePlaced || prev.board[row][col]) {
      return;
    }

    // 置き間違い防止モードがONの場合の処理
    if (prev.confirmPlacementMode) {
      if (!prev.pendingStone || prev.pendingStone.row !== row || prev.pendingStone.col !== col) {
        setGameState({ ...prev, pendingStone: { row, col } });
        return;
      }
    }

    // 履歴に保存 (オンライン以外)
    if (prev.gameMode !== 'Online') {
      setHistory(h => [...h, prev]);
    }

    const newBoard = prev.board.map(r => [...r]);
    const probability = STONE_PROBABILITIES[prev.currentPlayer][prev.selectedStoneIndex];

    // 新しい石を置く
    newBoard[row][col] = { probability };

    // 最後に置いた石の情報を更新
    const newLastBlack = prev.currentPlayer === 'Black' ? prev.selectedStoneIndex : prev.lastBlackStoneIndex;
    const newLastWhite = prev.currentPlayer === 'White' ? prev.selectedStoneIndex : prev.lastWhiteStoneIndex;

    const newState = {
      ...prev,
      board: newBoard,
      lastBlackStoneIndex: newLastBlack,
      lastWhiteStoneIndex: newLastWhite,
      isStonePlaced: true, // 石を置いたフラグを立てる（ターンはまだ交代しない）
      pendingStone: null,
    };

    // 楽観的更新: 通信を待たずにローカルの状態を即座に更新
    setGameState(newState);

    // オンラインならDB更新
    if (prev.gameMode === 'Online') {
      if (!roomId) return;
      // undefinedが含まれているとFirebaseがエラーになるため、JSON変換で除去する
      const cleanState = JSON.parse(JSON.stringify(newState));
      update(ref(db, `rooms/${roomId}`), cleanState).catch(console.error);
    }
  }, [roomId, myColor]);

  // ターン終了処理
  const endTurn = useCallback(() => {
    const prev = gameStateRef.current;
    const effectiveColor = getEffectiveMyColor(prev);
    if (prev.gameMode === 'Online' && prev.currentPlayer !== effectiveColor) return;

    // 履歴に保存 (オンライン以外)
    if (prev.gameMode !== 'Online') {
      setHistory(h => [...h, prev]);
    }

    const nextTurnPartialState = calculateNextTurnState(prev);

    const newState = {
      ...prev,
      ...nextTurnPartialState,
    };

    // 楽観的更新
    setGameState(newState);

    if (prev.gameMode === 'Online') {
      const cleanState = JSON.parse(JSON.stringify(newState));
      update(ref(db, `rooms/${roomId}`), cleanState).catch(console.error);
    }
  }, [roomId, myColor]);

  // 観測処理
  const observeBoard = useCallback(() => {
    const currentGameState = gameStateRef.current;
    const effectiveColor = getEffectiveMyColor(currentGameState);
    // 既にゲームオーバーや収縮中の場合は何もしない
    if (currentGameState.isGameOver || currentGameState.isCollapsing) return;

    // オンラインの場合、自分のターンでなければ操作不可
    if (currentGameState.gameMode === 'Online' && currentGameState.currentPlayer !== effectiveColor) return;

    // 石を置いていない場合、または既に観測中（結果表示中）の場合は観測できない
    if (!currentGameState.isStonePlaced || currentGameState.isObserving) return;

    // 観測回数のチェック
    const currentCount = currentGameState.currentPlayer === 'Black' ? currentGameState.blackObservationCount : currentGameState.whiteObservationCount;
    if (currentCount <= 0) return;

    // 履歴に保存 (オンライン以外)
    if (currentGameState.gameMode !== 'Online') {
      setHistory(h => [...h, currentGameState]);
    }

    // オンラインの場合は、ここでDBに「観測開始フラグ」を送る手もあるが、
    // シンプルに計算結果を送信する方式をとるため、まずはローカルで計算して結果を送る。
    // ただし、アニメーション同期のために isCollapsing を先に送るのが理想だが、
    // 簡易実装として、計算結果を即座にDBに反映し、両者でアニメーションさせる。

    // 観測開始：まずは収縮アニメーションを開始
    const collapsingState = { ...currentGameState, isCollapsing: true };
    setGameState(collapsingState); // 楽観的更新

    if (currentGameState.gameMode === 'Online') {
      update(ref(db, `rooms/${roomId}`), collapsingState).catch(console.error);
    }

    // 既存のタイマーがあればクリア
    if (timeoutRef.current !== undefined) clearTimeout(timeoutRef.current);

    // 1秒後に結果を確定させる
    timeoutRef.current = window.setTimeout(() => {
      const prev = gameStateRef.current; // Get latest state
      // リセットなどで状況が変わっていたら中断
      if (!prev.isCollapsing) return;

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

      let newState;
      if (winner) {
        newState = {
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
        newState = {
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

      setGameState(newState); // 楽観的更新
      if (prev.gameMode === 'Online') {
          update(ref(db, `rooms/${roomId}`), newState).catch(console.error);
      }
      timeoutRef.current = undefined;
    }, 1000); // 1秒間パラパラさせる

  }, [gameState, roomId, myColor]);

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
    setRoomId(''); // 部屋から退出
    setMyColor(null);
    setIsOpponentDisconnected(false);
  }, []);

  // CPUのターン処理
  useEffect(() => {
    // 条件チェック: PvEモード、CPUのターン、ゲーム進行中、アニメーション中でない
    const { gameMode, currentPlayer, cpuColor, isGameOver, isCollapsing, isStonePlaced, isObserving, blackObservationCount, whiteObservationCount, isReverting } = gameState;
    if (gameMode !== 'PvE' || currentPlayer !== cpuColor || isGameOver || isCollapsing || isReverting) {
      return;
    }

    let timer: number | undefined;

    // --- フェーズ1: 石を置く ---
    if (!isStonePlaced && !isObserving) {
      // 思考時間（1秒）
      timer = window.setTimeout(() => {
        cpuStateRef.current = 'placed';
        
        const currentState = gameStateRef.current;
        
        // 履歴に保存
        setHistory(h => [...h, currentState]);

        // 1. 石の選択
        const isCpuBlack = currentState.currentPlayer === 'Black';
        const lastCpuIndex = isCpuBlack ? currentState.lastBlackStoneIndex : currentState.lastWhiteStoneIndex;
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
        const target = getCpuMove(currentState.board, currentState.currentPlayer);
        if (!target) return;

        const newBoard = currentState.board.map(r => [...r]);
        const probability = STONE_PROBABILITIES[currentState.currentPlayer][selectedIndex];
        newBoard[target.r][target.c] = { probability };

        const newLastBlack = isCpuBlack ? selectedIndex : currentState.lastBlackStoneIndex;
        const newLastWhite = !isCpuBlack ? selectedIndex : currentState.lastWhiteStoneIndex;

        const newState = {
          ...currentState,
          board: newBoard,
          lastBlackStoneIndex: newLastBlack,
          lastWhiteStoneIndex: newLastWhite,
          isStonePlaced: true, // 石を置いた状態にする
        };
        setGameState(newState);
      }, 1000);
    }

    // --- フェーズ2: 観測するか決める or ターン終了 ---
    else if (isStonePlaced && !isObserving) {
      // 石を置いた直後なら、観測するか判断
      if (cpuStateRef.current === 'placed') {
        timer = window.setTimeout(() => {
          const cpuObsCount = currentPlayer === 'Black' ? blackObservationCount : whiteObservationCount;
          if (shouldCpuObserve(gameStateRef.current.board, currentPlayer, cpuObsCount)) {
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

  // UI側に返すmyColorも、推定済みのものを返す（ボタンの活性/非活性判定用）
  const exposedMyColor = getEffectiveMyColor(gameState);

  return {
    gameState,
    placeStone,
    endTurn,
    joinRoom,
    roomId,
    myColor: exposedMyColor,
    isOpponentDisconnected,
    selectStone,
    toggleConfirmMode,
    undo,
    observeBoard,
    resetGame,
  };
};
