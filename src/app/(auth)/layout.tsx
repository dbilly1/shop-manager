import Link from "next/link"
import { Playfair_Display, DM_Sans } from "next/font/google"

const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", weight: ["400", "700"] })
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" })

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${playfair.variable} ${dmSans.variable}`}
      style={{
        minHeight: "100vh",
        backgroundColor: "#0f0f0e",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        fontFamily: "var(--font-dm-sans, sans-serif)",
      }}
    >
      <style>{`
        .auth-input {
          width: 100%;
          background: #181816;
          border: 1px solid #2a2a27;
          border-radius: 7px;
          color: #f5f1ea;
          font-size: 0.9rem;
          padding: 0.6875rem 0.875rem;
          outline: none;
          transition: border-color 0.2s;
          font-family: var(--font-dm-sans, sans-serif);
          box-sizing: border-box;
        }
        .auth-input::placeholder { color: rgba(232,226,212,0.3); }
        .auth-input:focus { border-color: rgba(232,226,212,0.45); }

        .auth-label {
          display: block;
          font-size: 0.8125rem;
          font-weight: 500;
          color: rgba(232,226,212,0.7);
          margin-bottom: 0.375rem;
        }

        .auth-btn {
          width: 100%;
          background: #e8e2d4;
          color: #0f0f0e;
          font-size: 0.9rem;
          font-weight: 600;
          padding: 0.6875rem 1rem;
          border-radius: 7px;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          transition: background 0.2s, opacity 0.2s;
          font-family: var(--font-dm-sans, sans-serif);
        }
        .auth-btn:hover { background: #f5f1ea; }
        .auth-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        .auth-link {
          color: #e8e2d4;
          text-decoration: none;
          border-bottom: 1px solid rgba(232,226,212,0.3);
          transition: border-color 0.2s;
        }
        .auth-link:hover { border-color: #e8e2d4; }

        .auth-error {
          background: rgba(239,68,68,0.12);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 7px;
          padding: 0.625rem 0.875rem;
          font-size: 0.8125rem;
          color: #fca5a5;
        }

        .auth-divider {
          border: none;
          border-top: 1px solid #2a2a27;
          margin: 1.25rem 0;
        }

        @media (max-width: 480px) {
          .auth-card { padding: 1.375rem !important; }
        }
      `}</style>

      {/* Logo */}
      <Link href="/" style={{ textDecoration: "none", marginBottom: "2rem", textAlign: "center" }}>
        <div
          style={{
            fontFamily: "var(--font-playfair, serif)",
            fontSize: "1.375rem",
            color: "#f5f1ea",
            fontWeight: 400,
            letterSpacing: "-0.01em",
          }}
        >
          Shop<strong style={{ fontWeight: 700 }}>Manager</strong>
        </div>
        <div style={{ fontSize: "0.8rem", color: "rgba(232,226,212,0.4)", marginTop: "0.25rem" }}>
          Retail operations, simplified
        </div>
      </Link>

      {/* Card */}
      <div
        className="auth-card"
        style={{
          width: "100%",
          maxWidth: "420px",
          backgroundColor: "#181816",
          border: "1px solid #2a2a27",
          borderRadius: "12px",
          padding: "2rem",
        }}
      >
        {children}
      </div>
    </div>
  )
}
