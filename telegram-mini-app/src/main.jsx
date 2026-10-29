import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { outsideTelegramBlocked, startTelegram } from './telegram.js';
import './index.css';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        style={{
          minHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          textAlign: 'center',
          background: '#f6f8fc',
          color: '#1f1f1f',
        }}
      >
        <p style={{ margin: 0, fontSize: 16 }}>نمایش پنل متوقف شد.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            border: 0,
            borderRadius: 999,
            background: '#1A73E8',
            color: '#fff',
            padding: '12px 20px',
            font: 'inherit',
          }}
        >
          بارگذاری دوباره
        </button>
      </div>
    );
  }
}

/** Shown when the panel is opened outside Telegram (see outsideTelegramBlocked). */
function OutsideTelegramScreen() {
  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        textAlign: 'center',
        background: '#f6f8fc',
        color: '#1f1f1f',
      }}
    >
      <div style={{ fontSize: 40 }}>🔒</div>
      <p style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>این پنل فقط داخل تلگرام باز می‌شود</p>
      <p style={{ margin: 0, fontSize: 14, color: '#5f6368', maxWidth: 320, lineHeight: 1.7 }}>
        لطفاً پنل را از داخل ربات تلگرام باز کنید. دسترسی از مرورگر خارج از تلگرام مجاز نیست.
      </p>
    </div>
  );
}

function editableTarget(target) {
  return Boolean(target && target.closest && target.closest('input, textarea'));
}

document.addEventListener('contextmenu', (event) => {
  if (editableTarget(event.target)) return;
  event.preventDefault();
});

document.addEventListener('selectstart', (event) => {
  if (editableTarget(event.target)) return;
  event.preventDefault();
});

document.addEventListener('dragstart', (event) => {
  event.preventDefault();
});

const root = ReactDOM.createRoot(document.getElementById('root'));

if (outsideTelegramBlocked()) {
  // Not inside Telegram and no dev override → refuse to run. Never install the
  // dev mock here, so the panel cannot be used from a plain browser.
  root.render(
    <React.StrictMode>
      <OutsideTelegramScreen />
    </React.StrictMode>,
  );
} else {
  startTelegram();
  root.render(
    <React.StrictMode>
      <AppErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppErrorBoundary>
    </React.StrictMode>,
  );
}
