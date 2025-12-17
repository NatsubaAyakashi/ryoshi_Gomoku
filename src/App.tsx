import React, { useState } from 'react';
import Board from './components/Board';
import GameInfo from './components/GameInfo';
import Controls from './components/Controls';
import RuleModal from './components/RuleModal';
import { useQuantumGame } from './hooks/useQuantumGame';

const App: React.FC = () => {
  const { gameState, placeStone, endTurn, selectStone, toggleConfirmMode, undo, observeBoard, resetGame } = useQuantumGame();
  const { board, currentPlayer, selectedStoneIndex, lastBlackStoneIndex, lastWhiteStoneIndex, winner, isGameOver, isObserving, isCollapsing, showNoWinnerMessage, isStonePlaced, blackObservationCount, whiteObservationCount, confirmPlacementMode, pendingStone, gameMode, cpuColor, winningLine, isReverting } = gameState;

  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);

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
          <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
            <button 
              className="control-button" 
              style={{ fontSize: '0.8rem', padding: '0.5rem', opacity: gameState.gameMode === 'PvP' ? 1 : 0.5 }}
              onClick={() => resetGame('PvP', null)}
            >
              PvP
            </button>
            <button 
              className="control-button" 
              style={{ fontSize: '0.8rem', padding: '0.5rem', opacity: (gameState.gameMode === 'PvE' && gameState.cpuColor === 'White') ? 1 : 0.5 }}
              onClick={() => resetGame('PvE', 'White')}
            >
              PvE (先攻)
            </button>
            <button 
              className="control-button" 
              style={{ fontSize: '0.8rem', padding: '0.5rem', opacity: (gameState.gameMode === 'PvE' && gameState.cpuColor === 'Black') ? 1 : 0.5 }}
              onClick={() => resetGame('PvE', 'Black')}
            >
              PvE (後攻)
            </button>
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
          />
        </div>
      </div>

      <RuleModal isOpen={isRuleModalOpen} onClose={() => setIsRuleModalOpen(false)} />
    </div>
  );
};

export default App;
