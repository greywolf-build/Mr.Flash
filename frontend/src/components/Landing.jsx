import { useEffect, useState } from "react";
import wolfLogo from "../assets/wolf.png";

const TITLE_ASCII = `███╗   ███╗██████╗     ███████╗██╗      █████╗ ███████╗██╗  ██╗
████╗ ████║██╔══██╗    ██╔════╝██║     ██╔══██╗██╔════╝██║  ██║
██╔████╔██║██████╔╝    █████╗  ██║     ███████║███████╗███████║
██║╚██╔╝██║██╔══██╗    ██╔══╝  ██║     ██╔══██║╚════██║██╔══██║
██║ ╚═╝ ██║██║  ██║    ██║     ███████╗██║  ██║███████║██║  ██║
╚═╝     ╚═╝╚═╝  ╚═╝    ╚═╝     ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝`;

const BOOT_LINES = [
  "[boot] Initializing Mr. Flash v1.0.0 ...",
  "[boot] Loading Aave V3 flash-loan module ...................... OK",
  "[boot] Connecting to Flashbots relay (mainnet) ................ OK",
  "[boot] Multicall3 price reader online ......................... OK",
  "[boot] Pool registry indexed: Uni V2/V3 · Sushi · Curve · Bal .. OK",
  "[boot] Scanners armed: ETH · BASE · ARB · OP · POLYGON ........ OK",
  "[boot] Outlier filter calibrated (10% threshold) .............. OK",
  "[boot] Auto-executor safety caps (60s cooldown, 10/day) ....... OK",
  "[ready] Greywolf Terminal ready. Hunting edges.",
];

const SPECS = [
  { label: "STRATEGY", value: "FLASH-LOAN DEX ARB" },
  { label: "CHAINS", value: "ETH · BASE · ARB · OP · POLY" },
  { label: "CAPITAL", value: "AAVE V3 · FLASH-LOANED" },
  { label: "EXECUTION", value: "PARASWAP → FLASHBOTS" },
  { label: "STACK", value: "SOLIDITY · NODE · REACT" },
  { label: "PROTECTION", value: "REAL-QUOTE PRE-FLIGHT" },
];

const FEATURES = [
  {
    title: "Atomic Flash Loans",
    body: "Aave V3 supplies the working capital in a single transaction. Operator only pays gas — no inventory required for same-chain arbitrage.",
  },
  {
    title: "Multicall3 Scanning",
    body: "Every chain's DEX prices read in a single RPC call via Multicall3. Decodes V3 sqrtPriceX96, V2 reserves, and Curve get_dy() in-process.",
  },
  {
    title: "Ghost-Pool Filtering",
    body: "Rejects stale or dust-liquidity pools that would distort spot prices. Median-based outlier filter tightened to 10% cross-DEX deviation.",
  },
  {
    title: "Real-Quote Pre-Flight",
    body: "Before submitting, fetches live Paraswap quotes at execution size. If real slippage kills the edge, the trade is aborted — never loses on a fake.",
  },
  {
    title: "Flashbots Protection",
    body: "Mainnet executions submit via Flashbots bundles. No mempool exposure, no front-running, no failed-tx gas bleed.",
  },
  {
    title: "Auto-Executor",
    body: "Headless bot with 60s cooldown, 10 attempts/day cap, and built-in profitability gate. Toggle on/off from the UI or run entirely unattended.",
  },
];

const RUN_STEPS = [
  { cmd: "git clone <repo> && cd mr.flash", note: "clone the repository" },
  { cmd: "npm install", note: "install root + workspace deps" },
  { cmd: "cp .env.example .env", note: "fill RPC URLs + PRIVATE_KEY" },
  { cmd: "cd backend && npm run dev", note: "start scanner + WS server" },
  { cmd: "cd frontend && npm run dev", note: "launch terminal UI" },
];

export default function Landing({ onEnter }) {
  const [linesShown, setLinesShown] = useState(0);
  const [typedLine, setTypedLine] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (linesShown >= BOOT_LINES.length) return;

    const target = BOOT_LINES[linesShown];
    if (typedLine.length < target.length) {
      const t = setTimeout(() => {
        setTypedLine(target.slice(0, typedLine.length + 1));
      }, 8);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setLinesShown((n) => n + 1);
      setTypedLine("");
    }, 120);
    return () => clearTimeout(t);
  }, [typedLine, linesShown]);

  const booted = linesShown >= BOOT_LINES.length;

  const handleSkip = () => {
    if (!booted) {
      setLinesShown(BOOT_LINES.length);
      setTypedLine("");
    }
  };

  return (
    <div className="landing" onClick={handleSkip}>
      <div className="landing-scanlines" />
      <div className="landing-vignette" />

      <div className="landing-content" onClick={(e) => e.stopPropagation()}>
        <div className="landing-brand">
          <img src={wolfLogo} alt="Mr. Flash" className="landing-logo" />
          <pre className="landing-ascii">{TITLE_ASCII}</pre>
          <div className="landing-tagline">
            MEV BOT · FLASH-LOAN DEX ARBITRAGE · MULTI-CHAIN
          </div>
          <div className="landing-portfolio-badge">[ PORTFOLIO PROJECT ]</div>
        </div>

        <div className="landing-boot">
          {BOOT_LINES.slice(0, linesShown).map((line, i) => (
            <div key={i} className="landing-boot-line landing-boot-done">
              {line}
            </div>
          ))}
          {!booted && (
            <div className="landing-boot-line">
              {typedLine}
              <span className="landing-cursor">█</span>
            </div>
          )}
          {!booted && (
            <div className="landing-skip-hint">[click anywhere to skip]</div>
          )}
        </div>

        {booted && (
          <>
            <div className="landing-specs">
              {SPECS.map((s) => (
                <div key={s.label} className="landing-spec">
                  <span className="landing-spec-label">{s.label}</span>
                  <span className="landing-spec-value">{s.value}</span>
                </div>
              ))}
            </div>

            <div className="landing-tabs">
              {[
                { id: "overview", label: "OVERVIEW" },
                { id: "features", label: "FEATURES" },
                { id: "run", label: "HOW TO RUN" },
                { id: "architecture", label: "ARCHITECTURE" },
              ].map((t) => (
                <button
                  key={t.id}
                  className={`landing-tab ${activeTab === t.id ? "active" : ""}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="landing-tab-content">
              {activeTab === "overview" && (
                <div className="landing-section">
                  <p>
                    <span className="landing-kw">Mr. Flash</span> is a
                    full-stack MEV bot that hunts DEX price dislocations
                    across 5 EVM chains and executes arbitrage trades using{" "}
                    <span className="landing-kw">Aave V3 flash loans</span>.
                    All capital is borrowed atomically — the operator only
                    supplies gas.
                  </p>
                  <p>
                    Built as a <span className="landing-kw">portfolio piece</span>{" "}
                    to demonstrate end-to-end DeFi engineering: smart contract
                    development, multi-chain backend infrastructure, real-time
                    data pipelines, and a custom terminal-themed React UI.
                  </p>
                  <p>
                    Same-chain arb is highly competitive against professional
                    searchers, so this project emphasizes{" "}
                    <span className="landing-kw">correct architecture</span>{" "}
                    and <span className="landing-kw">honest safety guards</span>{" "}
                    over aggressive alpha claims.
                  </p>
                </div>
              )}

              {activeTab === "features" && (
                <div className="landing-features">
                  {FEATURES.map((f) => (
                    <div key={f.title} className="landing-feature">
                      <div className="landing-feature-title">
                        <span className="landing-feature-bullet">▸</span>
                        {f.title}
                      </div>
                      <div className="landing-feature-body">{f.body}</div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "run" && (
                <div className="landing-section">
                  <div className="landing-run-intro">
                    Requires Node 20+, an Ethereum wallet with a small gas
                    reserve, and RPC endpoints (Alchemy or Infura recommended).
                  </div>
                  <ol className="landing-run-list">
                    {RUN_STEPS.map((s, i) => (
                      <li key={i} className="landing-run-step">
                        <div className="landing-run-num">{String(i + 1).padStart(2, "0")}</div>
                        <div className="landing-run-body">
                          <code className="landing-run-cmd">$ {s.cmd}</code>
                          <div className="landing-run-note"># {s.note}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="landing-run-tip">
                    <strong>TIP:</strong> Start with <code>AUTO OFF</code> and{" "}
                    <code>BRIDGE OFF</code>. Watch the scanner identify
                    opportunities and pre-flight rejections for a few minutes
                    before enabling auto-execution.
                  </div>
                </div>
              )}

              {activeTab === "architecture" && (
                <div className="landing-section">
                  <div className="landing-arch-grid">
                    <div className="landing-arch-block">
                      <div className="landing-arch-label">CONTRACTS</div>
                      <div className="landing-arch-desc">
                        Solidity · Hardhat · Aave V3 flash-loan receiver ·
                        atomic arb executor
                      </div>
                    </div>
                    <div className="landing-arch-block">
                      <div className="landing-arch-label">BACKEND</div>
                      <div className="landing-arch-desc">
                        Node.js · Express · WebSocket · ethers v6 ·
                        multi-chain scanner · Paraswap client · Flashbots
                        bundle submitter
                      </div>
                    </div>
                    <div className="landing-arch-block">
                      <div className="landing-arch-label">FRONTEND</div>
                      <div className="landing-arch-desc">
                        React · Redux Toolkit · Vite · terminal aesthetic ·
                        real-time WS feed · auto-execute controls
                      </div>
                    </div>
                    <div className="landing-arch-block">
                      <div className="landing-arch-label">DATA</div>
                      <div className="landing-arch-desc">
                        Multicall3 batched reads · V3 slot0 decode · V2
                        reserves · Curve get_dy · outlier + dust filters
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="landing-warning">
              <span className="landing-warning-tag">DISCLAIMER</span>
              Demonstration project. Mainnet MEV is dominated by professional
              searchers with co-located infrastructure. Do not expect profit —
              treat any mainnet gas cost as tuition. Same-chain execution only;
              cross-chain rows require pre-positioned capital.
            </div>

            <button
              className="btn btn-primary landing-enter"
              onClick={onEnter}
              autoFocus
            >
              ENTER TERMINAL
            </button>

            <div className="landing-footer">
              Mr. Flash v1.0.0 · Greywolf Systems · Built for the hunt
            </div>
          </>
        )}
      </div>
    </div>
  );
}
