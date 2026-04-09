import wolfLogo from "../assets/wolf.png";
import ConnectWallet from "./ConnectWallet.jsx";

export default function Header() {
  return (
    <header className="header">
      <div className="header-brand">
        <img src={wolfLogo} alt="Greywolf" className="brand-logo" />
        <span className="brand-name">GREYWOLF</span>
        <span className="brand-tag">TERMINAL</span>
        <span className="brand-version">v1.0.0</span>
      </div>
      <ConnectWallet />
    </header>
  );
}
