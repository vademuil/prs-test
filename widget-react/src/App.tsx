import React, { useState, useEffect, useMemo } from 'react';
import {
  PACKAGE_ORDER, PACKAGE_DISPLAY, VALVE_TIERS, ZERO_DECIMAL,
  type PackageId,
} from './constants';
import {
  fxForTier, synthesizeRaw, buildRecommendations, fetchFxRates, fetchFromApi,
  buildCurrencyOptions, buildRecommendationsCsv, buildDetailedCsv, downloadCsv,
  type Packages, type RowResult, type PackageBlock, type CalculateResult,
} from './logic';

const WIDGET_VERSION = '1.0.0';
const BUILD_DATE = '2026-05-15';

export interface MountOptions {
  apiUrl?: string;            // Backend URL for Mode A (live Steam prices). If absent, Mode A is disabled.
  streamlitUrl?: string;      // Fallback link to full Streamlit deployment.
  defaultMode?: 'appid' | 'base_usd';
  defaultAppid?: string;
  defaultUsd?: number;
  primaryColor?: string;
}

interface AppProps { options: MountOptions; }

type ModeKind = 'appid' | 'base_usd';

// ===========================================================================
// Helpers
// ===========================================================================

function fmtPrice(value: number | null | undefined, currency: string): React.ReactNode {
  if (value == null) return <span className="prs-dash">—</span>;
  const formatted = ZERO_DECIMAL.has(currency)
    ? value.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <>{formatted}<span className="prs-ccy">{currency}</span></>;
}

// ===========================================================================
// Main App
// ===========================================================================

export function App({ options }: AppProps) {
  const apiUrl = options.apiUrl;
  const streamlitUrl = options.streamlitUrl ?? 'https://prs-publishers.streamlit.app';

  const [mode, setMode] = useState<ModeKind>(options.defaultMode ?? 'base_usd');
  const [appid, setAppid] = useState<string>(options.defaultAppid ?? '730');
  const [baseUsd, setBaseUsd] = useState<number>(options.defaultUsd ?? 29.99);

  const [results, setResults] = useState<CalculateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [targetCurrency, setTargetCurrency] = useState<string>('USD');
  const [distShare, setDistShare] = useState<number>(20.0);
  const [activeTab, setActiveTab] = useState<'recommendations' | 'detailed'>('recommendations');

  const calculate = async () => {
    setError(null);
    setLoading(true);
    try {
      if (mode === 'appid') {
        if (!apiUrl) {
          throw new Error(
            'Live Steam prices require a backend. Pass `apiUrl` to PRSWidget.mount() or use Base USD mode.',
          );
        }
        if (!/^\d+$/.test(appid.trim())) throw new Error('AppID must be numeric (e.g. 730).');
        const data = await fetchFromApi(apiUrl, { mode: 'appid', appid: appid.trim() });
        setResults(data);
      } else {
        const fx = await fetchFxRates();
        const raw = synthesizeRaw(baseUsd);
        const packages = buildRecommendations(raw, fx);
        setResults({
          resultsHeader: `Valve suggested pricing @ $${baseUsd.toFixed(2)}`,
          fxRates: fx,
          currencyOptions: buildCurrencyOptions(packages),
          packages,
        });
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  // Recompute currency options + reset selected when results change
  const currencyOptions = useMemo(() => {
    if (!results) return [];
    return results.currencyOptions.length
      ? results.currencyOptions
      : buildCurrencyOptions(results.packages);
  }, [results]);

  useEffect(() => {
    if (results && !currencyOptions.includes(targetCurrency)) setTargetCurrency('USD');
  }, [results, currencyOptions, targetCurrency]);

  const fxTarget = useMemo(() => {
    if (!results) return 1.0;
    return fxForTier(targetCurrency, results.fxRates) || 1.0;
  }, [results, targetCurrency]);

  return (
    <div className="prs-widget" style={options.primaryColor ? ({ ['--prs-primary']: options.primaryColor } as any) : undefined}>
      <div className="prs-subtitle">
        Recommends target retail prices per regional package (ROW / Asia / CN / RU-CIS / LATAM / MENA)
        to balance publisher revenue and protect against cross-border arbitrage.
      </div>

      <ParamsCard
        mode={mode} setMode={setMode}
        appid={appid} setAppid={setAppid}
        baseUsd={baseUsd} setBaseUsd={setBaseUsd}
        canDoAppid={!!apiUrl}
        loading={loading}
        onCalculate={calculate}
      />

      {error && <div className="prs-error">{error}</div>}
      {loading && <div className="prs-spinner">Calculating…</div>}

      {results && !loading && (
        <>
          <div className="prs-results-header">{results.resultsHeader}</div>

          <div className="prs-toolbar">
            <div className="prs-field">
              <label className="prs-field-label">Convert prices to</label>
              <select value={targetCurrency} onChange={(e) => setTargetCurrency(e.target.value)}>
                {currencyOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="prs-tabs">
              <button
                className={activeTab === 'recommendations' ? 'active' : ''}
                onClick={() => setActiveTab('recommendations')}
              >🎯 Recommendations</button>
              <button
                className={activeTab === 'detailed' ? 'active' : ''}
                onClick={() => setActiveTab('detailed')}
              >📋 Detailed</button>
            </div>
          </div>

          {activeTab === 'detailed' && (
            <div className="prs-params" style={{ marginBottom: 18 }}>
              <div className="prs-field">
                <label className="prs-field-label">Distribution Share, %</label>
                <input
                  type="number"
                  min={0} max={99} step={0.5}
                  value={distShare}
                  onChange={(e) => setDistShare(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div style={{ fontSize: 12, color: '#777', maxWidth: 480 }}>
                Affects only displayed Publisher Share USD — does not change recommended retail prices.
              </div>
            </div>
          )}

          {PACKAGE_ORDER.map(pkg => (
            <PackageCardView
              key={pkg}
              pkg={pkg}
              block={results.packages[pkg]}
              targetCurrency={targetCurrency}
              fxTarget={fxTarget}
              detailed={activeTab === 'detailed'}
              distShare={distShare}
            />
          ))}

          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button
              className="prs-outline-btn"
              onClick={() => {
                const csv = activeTab === 'detailed'
                  ? buildDetailedCsv(results.packages, distShare)
                  : buildRecommendationsCsv(results.packages);
                const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '');
                const suffix = mode === 'appid' ? appid : `base_${baseUsd.toFixed(2)}`;
                const name = activeTab === 'detailed'
                  ? `prs_detailed_${suffix}_${ts}.csv`
                  : `prs_rec_${suffix}_${ts}.csv`;
                downloadCsv(csv, name);
              }}
            >💾 Download CSV ({activeTab === 'detailed' ? 'detailed' : 'recommendations'})</button>
          </div>
        </>
      )}

      <div className="prs-footer">
        <a href={streamlitUrl} target="_blank" rel="noopener noreferrer">
          Open full version (Streamlit) →
        </a>
        <br />PRS Widget v{WIDGET_VERSION} · {BUILD_DATE}
      </div>
    </div>
  );
}

// ===========================================================================
// ParamsCard
// ===========================================================================

interface ParamsCardProps {
  mode: ModeKind;
  setMode: (m: ModeKind) => void;
  appid: string;
  setAppid: (s: string) => void;
  baseUsd: number;
  setBaseUsd: (n: number) => void;
  canDoAppid: boolean;
  loading: boolean;
  onCalculate: () => void;
}

function ParamsCard(p: ParamsCardProps) {
  return (
    <div className="prs-params">
      <div className="prs-field">
        <label className="prs-field-label">Input mode</label>
        <div className="prs-mode-toggle">
          <button
            className={p.mode === 'appid' ? 'active' : ''}
            onClick={() => p.setMode('appid')}
            disabled={!p.canDoAppid}
            title={p.canDoAppid ? 'Live Steam prices via Steam Store API' : 'Requires backend (apiUrl). Falls back to Base USD.'}
          >Steam AppID</button>
          <button
            className={p.mode === 'base_usd' ? 'active' : ''}
            onClick={() => p.setMode('base_usd')}
          >Base USD (Valve matrix)</button>
        </div>
      </div>

      {p.mode === 'appid' ? (
        <div className="prs-field">
          <label className="prs-field-label">Steam AppID</label>
          <input
            type="text"
            value={p.appid}
            onChange={(e) => p.setAppid(e.target.value)}
            placeholder="e.g. 730"
          />
        </div>
      ) : (
        <div className="prs-field">
          <label className="prs-field-label">Base USD price (Valve tier)</label>
          <select
            value={p.baseUsd}
            onChange={(e) => p.setBaseUsd(parseFloat(e.target.value))}
          >
            {VALVE_TIERS.map(t => (
              <option key={t} value={t}>${t.toFixed(2)}</option>
            ))}
          </select>
        </div>
      )}

      <button
        className="prs-primary-btn"
        onClick={p.onCalculate}
        disabled={p.loading}
      >{p.loading ? 'Calculating…' : 'Calculate'}</button>
    </div>
  );
}

// ===========================================================================
// PackageCardView
// ===========================================================================

interface PackageCardProps {
  pkg: PackageId;
  block: PackageBlock;
  targetCurrency: string;
  fxTarget: number;
  detailed: boolean;
  distShare: number;
}

function PackageCardView({ pkg, block, targetCurrency, fxTarget, detailed, distShare }: PackageCardProps) {
  if (!block) return null;
  const title = PACKAGE_DISPLAY[pkg];
  const meta = block.basePubUsd != null
    ? `base ${block.baseTier} · target $${block.basePubUsd.toFixed(2)}`
    : `base ${block.baseTier}`;
  const lift = block.liftPct != null && block.liftPct > 0.05
    ? `+${block.liftPct.toFixed(1)}%`
    : '0%';

  if (!block.rows.length) {
    return (
      <div className="prs-pkg">
        <div className="prs-pkg-header">
          <span className="prs-pkg-title">{title}</span>
          <span className="prs-pkg-meta">no data</span>
        </div>
        <div className="prs-pkg-footer">No prices available for this package.</div>
      </div>
    );
  }

  const candidates = block.rows.filter(r =>
    r.isChanged && r.gapPct != null && r.gapPct > 0.05);

  const shareFactor = 1 - distShare / 100;

  return (
    <div className="prs-pkg">
      <div className="prs-pkg-header">
        <span className="prs-pkg-title">{title}</span>
        <span className="prs-pkg-meta">{meta}</span>
      </div>

      <div className="prs-callout">
        <div className="prs-callout-header">We recommend:</div>
        <ul>
          <li>create region-locked keys</li>
          <li>increase prices for some regional currencies, or</li>
          <li>remove those currencies from partner distribution</li>
        </ul>
        <div>This will increase your distribution revenue by <span className="prs-lift">{lift}</span>.</div>
      </div>

      <table className="prs-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th className="num">Current SRP</th>
            <th className="num">Current SRP in {targetCurrency}</th>
            {detailed && <th className="num">Current Publisher Share USD</th>}
            <th className="num">Recommended SRP in {targetCurrency}</th>
            <th className="num">Recommended Local Price</th>
            <th className="num">Increase %</th>
          </tr>
        </thead>
        <tbody>
          {block.rows.map(r => (
            <RowView
              key={r.tier}
              row={r}
              targetCurrency={targetCurrency}
              fxTarget={fxTarget}
              detailed={detailed}
              shareFactor={shareFactor}
            />
          ))}
        </tbody>
      </table>

      {candidates.length > 0 ? (
        <div className="prs-pkg-footer">
          <div style={{ fontWeight: 600, marginBottom: 6, color: '#444' }}>
            Removal candidates (if raising the price is not an option):
          </div>
          <ul>
            {candidates.map(r => (
              <li key={r.tier}>
                <span
                  className="prs-dot"
                  style={{ background: r.gapPct > 0.15 ? 'var(--prs-pink)' : 'var(--prs-orange)' }}
                />
                <b>{r.tier}</b> — raise the price, or remove from distribution
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="prs-pkg-footer ok">
          ✓ All currencies in this package are within 5% of base — no removal candidates.
        </div>
      )}
    </div>
  );
}

interface RowViewProps {
  row: RowResult;
  targetCurrency: string;
  fxTarget: number;
  detailed: boolean;
  shareFactor: number;
}

function RowView({ row, targetCurrency, fxTarget, detailed, shareFactor }: RowViewProps) {
  const cls = row.isBase
    ? 'row-base'
    : (row.isChanged && row.gapPct > 0.15 ? 'row-pink'
       : (row.isChanged ? 'row-orange' : ''));

  const curInTarget = row.currentRetailUsd != null ? row.currentRetailUsd * fxTarget : null;
  const recInTarget = row.recSrpUsd != null ? row.recSrpUsd * fxTarget : null;

  const curPubShare = row.currentNetUsd != null ? row.currentNetUsd * shareFactor : null;

  const incNode = (row.isChanged && row.increasePct > 0)
    ? <span className="price-new">+{row.increasePct.toFixed(1)}%</span>
    : <span className="prs-dash">—</span>;

  return (
    <tr className={cls}>
      <td className="prs-tier-cell">
        {row.isBase && <span className="prs-badge">BASE</span>}
        {row.tier}
      </td>
      <td className="prs-num-cell">{fmtPrice(row.currentLocalPrice, row.tier)}</td>
      <td className="prs-num-cell">{fmtPrice(curInTarget, targetCurrency)}</td>
      {detailed && (
        <td className="prs-num-cell">
          {curPubShare != null
            ? <>${curPubShare.toFixed(2)}</>
            : <span className="prs-dash">—</span>}
        </td>
      )}
      <td className="prs-num-cell">
        {row.isChanged
          ? <span className="price-new">{fmtPrice(recInTarget, targetCurrency)}</span>
          : fmtPrice(recInTarget, targetCurrency)}
      </td>
      <td className="prs-num-cell">
        {row.isChanged
          ? <span className="price-new">{fmtPrice(row.recRetailLocal, row.tier)}</span>
          : fmtPrice(row.recRetailLocal, row.tier)}
      </td>
      <td className="prs-num-cell">{incNode}</td>
    </tr>
  );
}
