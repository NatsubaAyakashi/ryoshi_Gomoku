import React from 'react';
import { CellState } from '../types/game';

interface CellProps {
  cellState: CellState;
  onClick: () => void;
  isCollapsing: boolean;
}

const Cell: React.FC<CellProps> = ({ cellState, onClick, isCollapsing }) => {
  const renderContent = () => {
    if (!cellState) {
      // 石がない場合
      return null;
    }

    // 収縮中（観測アニメーション中）の場合
    if (isCollapsing) {
      return <div className="stone flickering-stone"></div>;
    }

    if (cellState.observedColor) {
      // 観測後の場合
      const stoneColor = cellState.observedColor === 'Black' ? 'black-stone' : 'white-stone';
      return <div key="observed" className={`stone ${stoneColor}`}></div>;
    } else {
      // 観測前の場合 (確率に応じた濃さと数字を表示)
      const probabilityPercent = Math.round(cellState.probability * 100);
      
      // 確率に基づいて石の色（グレーの濃さ）を計算 (1.0 = 黒(0), 0.0 = 白(255))
      const grayValue = Math.round(255 * (1 - cellState.probability));
      // 立体感を出すためのハイライト色（少し明るく）
      const highlightValue = Math.min(255, grayValue + 60);
      
      // 立体的なグラデーションを作成
      const background = `radial-gradient(circle at 30% 30%, rgb(${highlightValue}, ${highlightValue}, ${highlightValue}), rgb(${grayValue}, ${grayValue}, ${grayValue}))`;

      // 背景が暗い場合は文字を白く、明るい場合は黒くする
      const textColor = cellState.probability > 0.5 ? '#fff' : '#000';

      return (
        <div key="quantum" className="stone quantum-stone" style={{ background, color: textColor }}>
          {probabilityPercent}%
        </div>
      );
    }
  };

  return (
    <div className="cell" onClick={onClick}>
      {renderContent()}
    </div>
  );
};

export default Cell;
