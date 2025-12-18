import React, { useState } from 'react';
import Board from './components/Board';
import GameInfo from './components/GameInfo';
import Controls from './components/Controls';
import RuleModal from './components/RuleModal';
import { useQuantumGame } from './hooks/useQuantumGame';

const App: React.FC = () => {
  const { gameState, placeStone, endTurn, selectStone, toggleConfirmMode, undo, observeBoard, resetGame, joinRoom, roomId, myColor } = useQuantumGame();
  const { board, currentPlayer, selectedStoneIndex, lastBlackStoneIndex, lastWhiteStoneIndex, winner, isGameOver, isObserving, isCollapsing, showNoWinnerMessage, isStonePlaced, blackObservationCount, whiteObservationCount, confirmPlacementMode, pendingStone, gameMode, cpuColor, winningLine, isReverting } = gameState;

  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [inputRoomId, setInputRoomId] = useState('');

  const isCpuTurn = gameMode === 'PvE' && currentPlayer === cpuColor;

  return (
    <div className="app-container">
      <div className="header-container">
        <h1>Quantum Gomoku</h1>
        <button className="rules-btn" onClick={() => setIsRuleModalOpen(true)}>ルールを見る</button>
      </div>
      
      <div className="game-layout">
        <Board board={board} onCellClick={placeStone} isCollapsing={isCollapsing} pendingStone={pendingStone} winningLine={winningLine} isReverting={isReverting} />
        <div className="sidebar">
          <div className="sidebar-content">
            <div className="mode-buttons">
              <button 
                className="control-button mode-select-btn" 
                style={{ opacity: gameState.gameMode === 'PvP' ? 1 : 0.5 }}
                onClick={() => resetGame('PvP', null)}
              >
                PvP
              </button>
              <button 
                className="control-button mode-select-btn" 
                style={{ opacity: (gameState.gameMode === 'PvE' && gameState.cpuColor === 'White') ? 1 : 0.5 }}
                onClick={() => resetGame('PvE', 'White')}
              >
                PvE (先攻)
              </button>
              <button 
                className="control-button mode-select-btn" 
                style={{ opacity: (gameState.gameMode === 'PvE' && gameState.cpuColor === 'Black') ? 1 : 0.5 }}
                onClick={() => resetGame('PvE', 'Black')}
              >
                PvE (後攻)
              </button>
            </div>

            <div className="online-controls">
              <input 
                type="text" 
                placeholder="合言葉" 
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value)}
                className="room-input"
                disabled={!!roomId}
              />
              <button 
                className="control-button online-button" 
                style={{ backgroundColor: roomId ? '#666' : undefined }}
                onClick={() => joinRoom(inputRoomId)}
                disabled={!!roomId || !inputRoomId}
              >
                {roomId ? '入室中' : 'オンライン'}
              </button>
            </div>
            {roomId && (
               <div className="status-message">
                 {gameState.status === 'waiting' ? '対戦相手を待っています...' : `対戦中: あなたは${myColor === 'Black' ? '黒' : '白'}です`}
               </div>
            )}
          </div>
          <GameInfo
            currentPlayer={currentPlayer}
            selectedStoneIndex={selectedStoneIndex}
            lastBlackStoneIndex={lastBlackStoneIndex}
            lastWhiteStoneIndex={lastWhiteStoneIndex}
            onSelectStone={selectStone}
            winner={winner}
            isGameOver={isGameOver}
            showNoWinnerMessage={showNoWinnerMessage}
            blackObservationCount={blackObservationCount}
            whiteObservationCount={whiteObservationCount}
          />
          <Controls
            onObserve={observeBoard}
            onEndTurn={endTurn}
            onReset={() => resetGame()}
            isGameOver={isGameOver}
            isObserving={isObserving}
            isCollapsing={isCollapsing}
            isStonePlaced={isStonePlaced}
            observationCount={currentPlayer === 'Black' ? blackObservationCount : whiteObservationCount}
            confirmPlacementMode={confirmPlacementMode}
            onToggleConfirmMode={toggleConfirmMode}
            onUndo={undo}
            isCpuTurn={isCpuTurn}
            isReverting={isReverting}
            gameMode={gameMode}
          />
        </div>
      </div>

      <RuleModal isOpen={isRuleModalOpen} onClose={() => setIsRuleModalOpen(false)} />
    </div>
  );
};

export default App;
