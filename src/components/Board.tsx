import React from 'react';
import { BoardState } from '../types/game';
import Cell from './Cell';

interface BoardProps {
  board: BoardState;
  onCellClick: (row: number, col: number) => void;
  isCollapsing: boolean;
}

const Board: React.FC<BoardProps> = ({ board, onCellClick, isCollapsing }) => {
  return (
    <div className="board-container">
      <div className="board">
        {board.map((row, rowIndex) => (
          <div className="board-row" key={rowIndex}>
            {row.map((cell, colIndex) => (
              <Cell
                key={`${rowIndex}-${colIndex}`}
                cellState={cell}
                onClick={() => onCellClick(rowIndex, colIndex)}
                isCollapsing={isCollapsing}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Board;
