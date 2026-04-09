import { useState, useEffect } from "react";

const STORAGE_KEY = "greywolf_new_ideas";

export default function NewIdeas() {
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setNotes(saved);
  }, []);

  const handleChange = (e) => {
    setNotes(e.target.value);
    localStorage.setItem(STORAGE_KEY, e.target.value);
  };

  return (
    <div className="panel main-panel">
      <div className="panel-header">MODE 3 — NEW IDEAS</div>
      <div className="new-ideas-content">
        <div className="coming-soon">
          <pre>{`
  ╔══════════════════════════════════════╗
  ║                                      ║
  ║    NEW STRATEGY COMING SOON          ║
  ║                                      ║
  ║    Build your next edge here.        ║
  ║                                      ║
  ╚══════════════════════════════════════╝
          `}</pre>
        </div>
        <div className="notes-section">
          <label className="notes-label">STRATEGY NOTES</label>
          <textarea
            className="notes-textarea"
            value={notes}
            onChange={handleChange}
            placeholder={`Jot down concepts for future strategies...\n\nExamples:\n- Liquidation cascades on Aave/Compound\n- Cross-chain arb via bridges\n- MEV sandwich detection + counter-trade\n- Yield farming flash loan leverage`}
            rows={16}
          />
          <div className="notes-footer text-dim">
            Auto-saved to localStorage
          </div>
        </div>
      </div>
    </div>
  );
}
