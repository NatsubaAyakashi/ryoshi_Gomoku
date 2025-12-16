import React from 'react';

interface ControlsProps {
  onObserve: () => void;
  onEndTurn: () => void;
  onReset: () => void;
  isGameOver: boolean;
  isObserving?: boolean; // 追加
  isCollapsing: boolean;
  isStonePlaced: boolean;
  observationCount: number;
}

const Controls: React.FC<ControlsProps> = ({ onObserve, onEndTurn, onReset, isGameOver, isObserving, isCollapsing, isStonePlaced, observationCount }) => {
  return (
    <div className="controls">
      <button 
        onClick={onObserve} 
        disabled={isGameOver || isCollapsing || (!isStonePlaced && !isObserving) || (observationCount <= 0 && !isObserving)}
        className="control-button"
      >
        {isObserving ? "元に戻す" : `観測する (残り${observationCount}回)`}
      </button>

      {isStonePlaced && !isObserving && !isGameOver && (
        <button 
          onClick={onEndTurn}
          className="control-button"
          style={{ backgroundColor: '#4CAF50', color: 'white' }}
        >
          ターン終了
        </button>
      )}

      <button 
        onClick={onReset}
        className="control-button"
      >
        リセット
      </button>
    </div>
  );
};

export default Controls;
