import React from 'react';
import { BoardState } from '../types/game';
import Cell from './Cell';

interface BoardProps {
  board: BoardState;
  onCellClick: (row: number, col: number) => void;
  isCollapsing: boolean;
  pendingStone: { row: number, col: number } | null;
  winningLine: { row: number, col: number }[] | null;
  isReverting: boolean;
}

const Board: React.FC<BoardProps> = ({ board, onCellClick, isCollapsing, pendingStone, winningLine, isReverting }) => {
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
                isPending={pendingStone?.row === rowIndex && pendingStone?.col === colIndex}
                isWinning={winningLine?.some(pos => pos.row === rowIndex && pos.col === colIndex) ?? false}
                isReverting={isReverting}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Board;
