import React from 'react';
import { Player } from '../types/game';

interface GameInfoProps {
  currentPlayer: Player;
  selectedStoneIndex: 0 | 1;
  lastBlackStoneIndex: 0 | 1 | null;
  lastWhiteStoneIndex: 0 | 1 | null;
  onSelectStone: (index: 0 | 1) => void;
  winner: Player | null;
  isGameOver: boolean;
  showNoWinnerMessage: boolean;
  blackObservationCount: number;
  whiteObservationCount: number;
  isInteractive: boolean;
}

const GameInfo: React.FC<GameInfoProps> = ({ currentPlayer, selectedStoneIndex, lastBlackStoneIndex, lastWhiteStoneIndex, onSelectStone, winner, isGameOver, showNoWinnerMessage, blackObservationCount, whiteObservationCount, isInteractive }) => {
  const getMessage = () => {
    if (showNoWinnerMessage) {
      return (
        <div>
          <h2 className="no-winner-message">勝負つかず...</h2>
          <div className="progress-bar" />
        </div>
      );
    }

    if (isGameOver && winner) {
      const winnerText = winner === 'Black' ? '黒' : '白';
      return <h2 className="winner-message">{winnerText} の勝利！</h2>;
    }
    
    const playerText = currentPlayer === 'Black' ? '黒' : '白';
    
    // ボタンの表示設定
    const isBlack = currentPlayer === 'Black';
    const options = [
      { index: 0, label: isBlack ? '90%' : '30%' },
      { index: 1, label: isBlack ? '70%' : '10%' }
    ].map(opt => ({
      ...opt,
      disabled: isBlack 
        ? (opt.index === 0 && lastBlackStoneIndex === 0) || !isInteractive
        : (opt.index === 1 && lastWhiteStoneIndex === 1) || !isInteractive
    }));

    return (
      <div>
        <h2>現在のターン: {playerText}</h2>
        <div style={{ fontSize: '0.9em', marginBottom: '10px', color: '#aaa' }}>
          <p>黒の観測残り: {blackObservationCount}回</p>
          <p>白の観測残り: {whiteObservationCount}回</p>
        </div>
        <p>石の種類を選択 (黒になる確率):</p>
        <div className="prob-button-container" style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          {options.map((opt) => (
            <button
              className="prob-button"
              key={opt.index}
              onClick={() => onSelectStone(opt.index as 0 | 1)}
              disabled={opt.disabled || isGameOver}
              style={{
                padding: '8px 16px',
                backgroundColor: selectedStoneIndex === opt.index ? '#4CAF50' : '#555',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: opt.disabled ? 'not-allowed' : 'pointer',
                opacity: opt.disabled ? 0.5 : 1,
                fontWeight: selectedStoneIndex === opt.index ? 'bold' : 'normal'
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return <div className="game-info">{getMessage()}</div>;
};

export default GameInfo;
