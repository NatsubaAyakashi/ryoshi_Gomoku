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
  confirmPlacementMode: boolean;
  onToggleConfirmMode: () => void;
  onUndo: () => void;
  isCpuTurn?: boolean;
}

const Controls: React.FC<ControlsProps> = ({ onObserve, onEndTurn, onReset, isGameOver, isObserving, isCollapsing, isStonePlaced, observationCount, confirmPlacementMode, onToggleConfirmMode, onUndo, isCpuTurn }) => {
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
        onClick={onUndo}
        className="control-button"
        disabled={isCpuTurn}
      >
        待った
      </button>

      <button 
        onClick={onReset}
        className="control-button"
      >
        リセット
      </button>

      <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
        <input 
          type="checkbox" 
          id="confirmMode" 
          checked={confirmPlacementMode} 
          onChange={onToggleConfirmMode}
          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
        />
        <label htmlFor="confirmMode" style={{ cursor: 'pointer' }}>置き間違い防止モード</label>
      </div>
    </div>
  );
};

export default Controls;
