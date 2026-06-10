import { useState } from "react";

// Synthetic exception queue — conflicting multi-system signals per case.
const SAMPLE_QUEUE = [
  {
    id: "TXN-99431",
    label: "Cross-border payout, NGN to GHS",
    raw: `EXCEPTION RECORD
Transaction ref: TXN-99431
Type: Cross-border payout
Corridor: NGN to GHS
Amount: NGN 4,200,000 (approx GHS 41,000)
Initiated: 6 hours ago
Recovery window: Partner bank reversal window closes in 2 hours

SIGNALS
- Internal ledger: Marked SETTLED. Funds debited from merchant balance.
- PSP / partner bank report: No record of credit to beneficiary. Status shows PENDING_INVESTIGATION.
- Rail / network status: Outbound message acknowledged by intermediary, no confirmation from receiving bank.
- Customer / order record: Beneficiary reports funds not received. Merchant chasing.

NOTES
Reversal window with the intermediary closes soon. After that, funds recovery requires manual interbank claim with uncertain timeline.`
  },
  {
    id: "TXN-99502",
    label: "Domestic collection, FX discrepancy",
    raw: `EXCEPTION RECORD
Transaction ref: TXN-99502
Type: Settlement amount discrepancy
Corridor: Domestic NGN with USD card settlement
Amount: Expected NGN 1,850,000 / Received NGN 1,847,300
Initiated: 3 days ago
Recovery window: None — funds settled, this is a reconciliation discrepancy

SIGNALS
- Internal ledger: Expected NGN 1,850,000 based on locked FX rate at checkout.
- PSP / partner bank report: Settled NGN 1,847,300. Applied a different FX rate at settlement than at authorisation.
- Rail / network status: Settlement completed successfully.
- Customer / order record: Customer charged correct amount. Discrepancy is on the settlement leg, not customer-facing.

NOTES
Difference of NGN 2,700. Pattern may repeat across many transactions if FX timing mismatch is systemic.`
  },
  {
    id: "TXN-99655",
    label: "Duplicate debit, customer blocked",
    raw: `EXCEPTION RECORD
Transaction ref: TXN-99655
Type: Possible duplicate debit
Corridor: Domestic NGN
Amount: NGN 60,000 (debited twice)
Initiated: 30 minutes ago
Recovery window: Funds held in suspense, recoverable but customer is blocked now

SIGNALS
- Internal ledger: Two debits of NGN 60,000 against same order ID within 4 seconds.
- PSP / partner bank report: Confirms two captures, both successful.
- Rail / network status: Both transactions show completed.
- Customer / order record: Customer's account frozen pending resolution. Customer cannot transact. Active complaint raised.

NOTES
Low monetary value, fully recoverable, but customer is actively blocked and complaining. Goodwill and reputational exposure.`
  }
];

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=Inter:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; background: #F7F7F5; color: #0F0F0F; }
  .app { display: flex; flex-direction: column; min-height: 100vh; }
  .header { background: #0A1628; color: #F7F7F5; padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1a2d4a; }
  .header-title { font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; }
  .header-sub { font-family: 'DM Mono', monospace; font-size: 11px; color: #6B7E9C; letter-spacing: 0.05em; margin-top: 2px; }
  .header-badge { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #6B7E9C; border: 1px solid #1a2d4a; padding: 3px 8px; }

  .toolbar { padding: 20px 32px; border-bottom: 1px solid #E0DDD8; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .toolbar-left { display: flex; flex-direction: column; gap: 2px; }
  .toolbar-title { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #1A1A1A; }
  .toolbar-desc { font-size: 12px; color: #1A1A1A; }
  .run-btn { font-family: 'DM Mono', monospace; font-size: 12px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; padding: 12px 24px; background: #0A1628; color: #F7F7F5; border: 1px solid #0A1628; cursor: pointer; transition: background 0.15s; }
  .run-btn:hover:not(:disabled) { background: #1a2d4a; }
  .run-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .summary-bar { display: grid; grid-template-columns: repeat(5, 1fr); border-bottom: 1px solid #E0DDD8; }
  .summary-cell { padding: 18px 24px; border-right: 1px solid #E0DDD8; }
  .summary-cell:last-child { border-right: none; }
  .summary-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #1A1A1A; margin-bottom: 6px; }
  .summary-value { font-family: 'DM Mono', monospace; font-size: 20px; font-weight: 500; color: #0F0F0F; }
  .summary-value.loss { color: #C0392B; }

  .main { display: grid; grid-template-columns: 380px 1fr; flex: 1; }
  .queue-panel { border-right: 1px solid #E0DDD8; overflow-y: auto; }
  .queue-item { padding: 16px 24px; border-bottom: 1px solid #F0EDE8; cursor: pointer; transition: background 0.12s; }
  .queue-item:hover { background: #F2F1EE; }
  .queue-item.active { background: #EEF0F5; border-left: 3px solid #0A1628; }
  .queue-item.pending { opacity: 0.85; }
  .queue-item-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .queue-ref { font-family: 'DM Mono', monospace; font-size: 12px; font-weight: 500; color: #0F0F0F; }
  .queue-band { font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 500; letter-spacing: 0.06em; padding: 2px 7px; }
  .band-P1_CRITICAL { background: #FBEAE8; color: #C0392B; }
  .band-P2_HIGH { background: #FBF1E2; color: #B7770D; }
  .band-P3_STANDARD { background: #EAF3EE; color: #1A7F4B; }
  .queue-label { font-size: 12px; color: #0F0F0F; margin-bottom: 6px; line-height: 1.4; }
  .queue-meta { font-family: 'DM Mono', monospace; font-size: 10px; color: #2A2A2A; letter-spacing: 0.03em; }
  .queue-pending-tag { font-family: 'DM Mono', monospace; font-size: 10px; color: #2A2A2A; letter-spacing: 0.05em; }

  .detail-panel { padding: 28px 32px; overflow-y: auto; }
  .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; gap: 8px; }
  .empty-title { font-family: 'DM Mono', monospace; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: #2A2A2A; }
  .empty-sub { font-size: 12px; color: #2A2A2A; max-width: 260px; text-align: center; line-height: 1.5; }

  .loading { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; gap: 16px; }
  .loading-bar { width: 160px; height: 2px; background: #E0DDD8; overflow: hidden; }
  .loading-inner { height: 100%; background: #0A1628; width: 40%; animation: ld 1.4s ease-in-out infinite; }
  @keyframes ld { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
  .loading-text { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #1A1A1A; }

  .d-header { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #E0DDD8; }
  .d-ref { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
  .d-meta { font-family: 'DM Mono', monospace; font-size: 11px; color: #1A1A1A; letter-spacing: 0.04em; }
  .section-title { font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: #1A1A1A; margin: 22px 0 10px; }

  .classification-row { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
  .classification-label { font-family: 'DM Mono', monospace; font-size: 15px; font-weight: 500; color: #0F0F0F; }
  .confidence-tag { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.06em; padding: 2px 8px; border: 1px solid #2A2A2A; color: #1A1A1A; }

  .score-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #E0DDD8; border: 1px solid #E0DDD8; margin-bottom: 4px; }
  .score-cell { background: #FAFAF8; padding: 14px 16px; }
  .score-cell.full { grid-column: 1 / -1; }
  .score-cell.expected { background: #FDF5F4; }
  .score-cell-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.07em; text-transform: uppercase; color: #1A1A1A; margin-bottom: 6px; }
  .score-cell-value { font-family: 'DM Mono', monospace; font-size: 16px; font-weight: 500; color: #0F0F0F; margin-bottom: 4px; }
  .score-cell-value.risk { color: #C0392B; }
  .score-cell-note { font-size: 12px; color: #555; line-height: 1.5; }

  .formula { font-family: 'DM Mono', monospace; font-size: 11px; color: #6B7E9C; background: #0A1628; color: #C8D3E4; padding: 10px 14px; letter-spacing: 0.03em; margin-bottom: 4px; }

  .signal-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .signal-table th { text-align: left; font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.07em; text-transform: uppercase; color: #1A1A1A; padding: 6px 8px; border-bottom: 1px solid #E0DDD8; font-weight: 500; }
  .signal-table td { padding: 8px; border-bottom: 1px solid #F0EDE8; vertical-align: top; line-height: 1.4; color: #2A2A2A; }
  .signal-system { font-family: 'DM Mono', monospace; font-size: 11px; color: #0A1628; white-space: nowrap; }

  .reasoning-box, .funds-box { font-size: 13px; color: #333; line-height: 1.6; padding: 14px 16px; background: #FAFAF8; border: 1px solid #E0DDD8; }
  .funds-box { border-left: 3px solid #0A1628; }

  .resolution-list { list-style: none; counter-reset: step; }
  .resolution-list li { position: relative; padding: 8px 0 8px 32px; font-size: 13px; color: #333; line-height: 1.5; border-bottom: 1px solid #F0EDE8; counter-increment: step; }
  .resolution-list li:last-child { border-bottom: none; }
  .resolution-list li::before { content: counter(step); position: absolute; left: 0; top: 8px; font-family: 'DM Mono', monospace; font-size: 11px; width: 20px; height: 20px; line-height: 20px; text-align: center; background: #0A1628; color: #fff; }

  .routing-box { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border: 1px solid #E0DDD8; }
  .routing-box.human { border-color: #B7770D; background: #FDF8F0; }
  .routing-box.auto { border-color: #1A7F4B; background: #F4FBF7; }
  .routing-tag { font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; }
  .routing-tag.human { color: #B7770D; }
  .routing-tag.auto { color: #1A7F4B; }
  .routing-reason { font-size: 12px; color: #555; }

  .notice { font-family: 'DM Mono', monospace; font-size: 10px; color: #2A2A2A; letter-spacing: 0.04em; padding: 14px 32px; border-top: 1px solid #E0DDD8; line-height: 1.5; }

  @media (max-width: 1000px) { .main { grid-template-columns: 1fr; } .queue-panel { border-right: none; border-bottom: 1px solid #E0DDD8; max-height: 320px; } .summary-bar { grid-template-columns: repeat(2, 1fr); } }
`;

const bandLabel = { P1_CRITICAL: "P1", P2_HIGH: "P2", P3_STANDARD: "P3" };

export default function ExceptionTriage() {
  const [results, setResults] = useState({});
  const [loadingId, setLoadingId] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [runningAll, setRunningAll] = useState(false);

  const triageOne = async (item) => {
    setLoadingId(item.id);
    try {
      const res = await fetch("/.netlify/functions/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputText: item.raw })
      });
      const data = await res.json();
      if (!data.error) {
        setResults(prev => ({ ...prev, [item.id]: data }));
      }
    } catch (e) {
      // silent for demo
    } finally {
      setLoadingId(null);
    }
  };

  const runAll = async () => {
    setRunningAll(true);
    for (const item of SAMPLE_QUEUE) {
      await triageOne(item);
    }
    setRunningAll(false);
    if (!activeId) setActiveId(SAMPLE_QUEUE[0].id);
  };

  const active = activeId ? results[activeId] : null;
  const triaged = Object.values(results);

  const fmtMoney = (s) => s || "—";
  const totalCount = SAMPLE_QUEUE.length;
  const triagedCount = triaged.length;
  const p1Count = triaged.filter(r => r.priority === "P1_CRITICAL").length;
  const humanCount = triaged.filter(r => r.requires_human).length;
  const autoCount = triaged.filter(r => !r.requires_human).length;

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <header className="header">
          <div>
            <div className="header-title">Exception Triage</div>
            <div className="header-sub">Payment Operations — Expected Loss Prioritisation</div>
          </div>
        </header>

        <div className="toolbar">
          <div className="toolbar-left">
            <div className="toolbar-title">Exception Queue</div>
            <div className="toolbar-desc">Triage each exception by expected irreversible loss, then route by confidence.</div>
          </div>
          <button className="run-btn" onClick={runAll} disabled={runningAll}>
            {runningAll ? "Triaging Queue..." : "Triage Queue"}
          </button>
        </div>

        <div className="summary-bar">
          <div className="summary-cell">
            <div className="summary-label">In Queue</div>
            <div className="summary-value">{triagedCount} / {totalCount}</div>
          </div>
          <div className="summary-cell">
            <div className="summary-label">P1 Critical</div>
            <div className="summary-value loss">{p1Count}</div>
          </div>
          <div className="summary-cell">
            <div className="summary-label">Human Required</div>
            <div className="summary-value">{humanCount}</div>
          </div>
          <div className="summary-cell">
            <div className="summary-label">Auto-Clearable</div>
            <div className="summary-value">{autoCount}</div>
          </div>
          <div className="summary-cell">
            <div className="summary-label">Prioritised By</div>
            <div className="summary-value" style={{ fontSize: "12px", paddingTop: "6px" }}>P(loss) × Value</div>
          </div>
        </div>

        <div className="main">
          <div className="queue-panel">
            {SAMPLE_QUEUE.map(item => {
              const r = results[item.id];
              return (
                <div
                  key={item.id}
                  className={`queue-item ${activeId === item.id ? "active" : ""} ${!r ? "pending" : ""}`}
                  onClick={() => r && setActiveId(item.id)}
                >
                  <div className="queue-item-top">
                    <span className="queue-ref">{item.id}</span>
                    {r
                      ? <span className={`queue-band band-${r.priority}`}>{bandLabel[r.priority]}</span>
                      : <span className="queue-pending-tag">{loadingId === item.id ? "..." : "pending"}</span>}
                  </div>
                  <div className="queue-label">{item.label}</div>
                  {r && <div className="queue-meta">{r.classification_label} &nbsp;|&nbsp; {fmtMoney(r.amount)}</div>}
                </div>
              );
            })}
          </div>

          <div className="detail-panel">
            {!active && loadingId && (
              <div className="loading">
                <div className="loading-bar"><div className="loading-inner" /></div>
                <div className="loading-text">Triaging exceptions</div>
              </div>
            )}

            {!active && !loadingId && (
              <div className="empty">
                <div className="empty-title">No exception selected</div>
                <div className="empty-sub">Run the queue, then select a case to see the triage reasoning and priority breakdown.</div>
              </div>
            )}

            {active && (
              <div>
                <div className="d-header">
                  <div className="d-ref">{active.transaction_ref}</div>
                  <div className="d-meta">{active.corridor} &nbsp;|&nbsp; {fmtMoney(active.amount)} &nbsp;|&nbsp; {active.triage_timestamp}</div>
                </div>

                <div className="section-title">Classification</div>
                <div className="classification-row">
                  <span className="classification-label">{active.classification_label}</span>
                  <span className="confidence-tag">{active.confidence} confidence</span>
                </div>

                <div className="section-title">Priority — Expected Irreversible Loss</div>
                <div className="formula">priority = P(unrecoverable) × value_at_risk × (1 + customer_impact)</div>
                <div className="score-grid">
                  <div className="score-cell">
                    <div className="score-cell-label">Recoverability Risk — P(unrecoverable)</div>
                    <div className="score-cell-value risk">{active.recoverability?.probability ?? active.recoverability_probability ?? "—"}</div>
                    <div className="score-cell-note">{active.recoverability?.note ?? active.recoverability_note ?? active.break_point}</div>
                  </div>
                  <div className="score-cell">
                    <div className="score-cell-label">Value at Risk</div>
                    <div className="score-cell-value">{fmtMoney(active.amount)}</div>
                    <div className="score-cell-note">Exposure currently in limbo</div>
                  </div>
                  <div className="score-cell expected full">
                    <div className="score-cell-label">Resulting Priority</div>
                    <div className="score-cell-value risk">{bandLabel[active.priority]} — {active.priority?.replace("_", " ")}</div>
                    <div className="score-cell-note">{active.priority_rationale}</div>
                  </div>
                </div>

                <div className="section-title">Signal Analysis</div>
                <table className="signal-table">
                  <thead>
                    <tr><th style={{ width: "140px" }}>System</th><th style={{ width: "120px" }}>Status</th><th>Interpretation</th></tr>
                  </thead>
                  <tbody>
                    {active.signal_analysis?.map((s, i) => (
                      <tr key={i}>
                        <td className="signal-system">{s.system}</td>
                        <td>{s.status}</td>
                        <td style={{ color: "#1A1A1A" }}>{s.interpretation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="section-title">Where the Funds Sit</div>
                <div className="funds-box">{active.funds_location}</div>

                <div className="section-title">Reasoning</div>
                <div className="reasoning-box">{active.reasoning}</div>

                <div className="section-title">Resolution Path</div>
                <ol className="resolution-list">
                  {active.resolution_path?.map((step, i) => <li key={i}>{step}</li>)}
                </ol>

                <div className="section-title">Routing</div>
                <div className={`routing-box ${active.requires_human ? "human" : "auto"}`}>
                  <span className={`routing-tag ${active.requires_human ? "human" : "auto"}`}>
                    {active.requires_human ? "Human Review Required" : "Auto-Clearable"}
                  </span>
                  <span className="routing-reason">
                    {active.requires_human ? active.human_review_reason : "High confidence, no funds movement required."}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="notice">
          Demo uses synthetic transaction data only. Production deployment for a regulated processor requires a private LLM integration, a data processing agreement, and recoverability probabilities calibrated against historical recovery data per corridor and failure type.
        </div>
      </div>
    </>
  );
}
