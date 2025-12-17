import React from 'react';

interface RuleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RuleModal: React.FC<RuleModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>量子五目並べ ルール</h2>
        <div className="rule-text">
          <p><strong>基本ルール:</strong></p>
          <ul>
            <li>縦・横・斜めのいずれかに、自分の色の石を5つ並べると勝利です。</li>
            <li>ただし、石の色は「観測」するまで確定しません（量子状態）。</li>
          </ul>
          <p><strong>石の確率:</strong></p>
          <ul>
            <li><strong>黒（先攻）:</strong> 90% または 70% の確率で黒になる石を使用します。</li>
            <li><strong>白（後攻）:</strong> 30% (70%白) または 10% (90%白) の確率で黒になる石を使用します。</li>
            <li>※ 強い石（黒90%、白10%）は2回連続で使用できません。</li>
          </ul>
          <p><strong>観測:</strong></p>
          <ul>
            <li>石を置いた後、「観測」を行うことができます。</li>
            <li>観測すると、盤面上の全ての石の色が確率に従って確定します。</li>
            <li>各プレイヤーは1ゲームにつき<strong>5回</strong>まで観測できます。</li>
            <li>観測して勝敗がつかなかった場合、盤面は観測前の状態に戻ります。</li>
            <li>観測時に両者が同時に勝利条件を満たしていた場合、観測を行ったプレイヤーの勝利となります。</li>
          </ul>
        </div>
        <button className="close-button" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
};

export default RuleModal;