/**
 * NFL Fantasy D/ST Streamer Tool
 * Interactive Client-Side Dashboard
 */

document.addEventListener('DOMContentLoaded', async () => {
  // State management
  let appData = null;
  let activeTab = 'week9';
  let currentRenderedWeek9Rows = [];
  let currentRenderedWeek10Rows = [];
  
  // Sort states for each table
  const sortStates = {
    week9: { column: 'Projected Fantasy Points', ascending: false },
    week10: { column: 'Opponent L4 Points Allowed', ascending: false },
    history: { column: 'Total Points Allowed (W1-8)', ascending: false },
    anatomy: { column: 'PPG', ascending: false },
    audit: { column: 'Projected Points', ascending: false }
  };

  // Filter states
  const filters = {
    search: '',
    tier: 'ALL',
    w10Verdict: 'ALL',
    backupOnly: false,
    weatherOnly: false,
    anatomyTeam: 'ALL'
  };

  // Initialize Header Controls (Theme Toggle & Visitor Counter) immediately
  initThemeToggle();
  initVisitorCounter();

  // 1. Data Initialization (Supports both file:// protocol via data.js and http:// via fetch)
  if (window.DEFENSE_DATA) {
    appData = window.DEFENSE_DATA;
    initializeApp();
  } else {
    try {
      const response = await fetch('data.json');
      appData = await response.json();
      initializeApp();
    } catch (err) {
      console.error('Failed to load defense data:', err);
      document.body.innerHTML = `
        <div style="padding: 3rem; text-align: center; color: #f87171;">
          <h2>Error Loading Fantasy D/ST Data</h2>
          <p>Please make sure <code>data.js</code> or <code>data.json</code> is located in the same directory.</p>
        </div>`;
    }
  }

  function initializeApp() {
    document.body.setAttribute('data-active-tab', activeTab);
    setupHeaderMeta();
    setupNavigation();
    setupFilterEvents();
    setupSortingEvents();
    setupModalEvents();

    // Initial render
    renderAll();
  }

  // Helper for consistent number formatting to 1 decimal place (or specified decimals)
  function formatNum(val, decimals = 1) {
    if (val === null || val === undefined || val === '-' || val === 'BYE') return val || '-';
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return num.toFixed(decimals);
  }

  // Helper for formatting Streaming Defense names (ensures home games display as (Home))
  function formatDstLabel(dstStr) {
    if (!dstStr) return '';
    return dstStr.replace(/\(vs\s+[A-Za-z]+\)/gi, '(Home)');
  }

  // Helper for 2-row QB cell formatting with wrapped badge
  function formatQbCell(qbRaw) {
    if (!qbRaw || qbRaw === '-' || qbRaw === 'BYE') return qbRaw || '-';
    let qbName = qbRaw;
    let qbStatusBadge = '';
    const parenIdx = qbRaw.indexOf('(');
    if (parenIdx !== -1) {
      qbName = qbRaw.slice(0, parenIdx).trim();
      const statusContent = qbRaw.slice(parenIdx + 1).replace(/\)$/, '').trim();
      if (statusContent.toLowerCase().includes('backup') || statusContent.toLowerCase().includes('yes')) {
        const cleanStatus = statusContent.replace(/^Yes:?\s*/i, 'Backup: ').replace(/^Yes$/i, 'Backup');
        qbStatusBadge = `<span class="qb-backup-badge">${cleanStatus}</span>`;
      } else {
        qbStatusBadge = `<span class="qb-starter-badge">Starter</span>`;
      }
    }
    return `
      <div class="qb-cell">
        <div class="qb-name">${qbName}</div>
        ${qbStatusBadge ? `<div class="qb-status-wrap">${qbStatusBadge}</div>` : ''}
      </div>
    `;
  }

  // Helper for compact 1-line injury badge (prevents multi-line row stretching)
  function formatInjuryCell(injRaw) {
    if (!injRaw || injRaw === '-' || injRaw.toLowerCase().includes('healthy')) {
      return '<span class="injury-healthy">✅ Healthy</span>';
    }
    if (injRaw.toUpperCase().includes('BYE')) {
      return '<span class="stat-dim">BYE</span>';
    }
    const items = injRaw.split(/\),\s*/).filter(Boolean);
    if (items.length <= 1) {
      return `<span class="injury-alert" title="${injRaw}">⚠️ ${injRaw}</span>`;
    }
    const firstItem = items[0];
    const parenIdx = firstItem.indexOf('(');
    const firstName = parenIdx !== -1 ? firstItem.slice(0, parenIdx).trim() : firstItem.trim();
    return `<span class="injury-alert" title="${injRaw} (Click row for full details)">⚠️ ${items.length} Injuries (${firstName} +${items.length - 1})</span>`;
  }

  // Helper for succinct 2-line rationale preview + inviting button
  function formatRationaleCell(rationaleText) {
    const text = rationaleText || 'Standard matchup projection.';
    return `
      <div class="rationale-preview-cell">
        <div class="rationale-snippet" title="Click for complete strategic breakdown">${text}</div>
        <button type="button" class="btn-rationale">Full Analysis ➔</button>
      </div>
    `;
  }

  // 2. Setup Header & Metadata
  function setupHeaderMeta() {
    if (!appData || !appData.meta) return;
    const meta = appData.meta;
    document.getElementById('header-week-badge').textContent = `Week ${meta.currentWeek} Matchups`;
    document.getElementById('header-updated-badge').textContent = `Updated: ${meta.lastUpdated}`;

    if (appData.weekMatchups && appData.weekMatchups.length > 0) {
      const active = appData.weekMatchups.filter(m => m.Target_DST && !m.Target_DST.includes('BYE'));
      if (active.length > 0) {
        // Top Smash Play
        const topSmash = [...active].sort((a, b) => (parseFloat(b.Proj_Fantasy_Pts) || 0) - (parseFloat(a.Proj_Fantasy_Pts) || 0))[0];
        if (topSmash) {
          document.getElementById('kpi-smash-name').textContent = formatDstLabel(topSmash.Target_DST);
          document.getElementById('kpi-smash-sub').textContent = `${formatNum(topSmash.Proj_Fantasy_Pts, 1)} Proj Pts • vs ${topSmash.Team}`;
        }

        // Top Floor Play
        const topFloor = [...active].sort((a, b) => (parseFloat(b.Predicted_Floor) || 0) - (parseFloat(a.Predicted_Floor) || 0))[0];
        if (topFloor) {
          document.getElementById('kpi-floor-name').textContent = formatDstLabel(topFloor.Target_DST);
          document.getElementById('kpi-floor-sub').textContent = `${formatNum(topFloor.Predicted_Floor, 1)} Floor • ${formatNum(topFloor.Proj_Sacks, 1)} Sacks`;
        }

        // Weather Alert
        const windy = active.filter(m => (m.Gametime_Weather || '').toLowerCase().includes('wind') || (m.Gametime_Weather || '').toLowerCase().includes('gust') || (m.Gametime_Weather || '').toLowerCase().includes('breezy'));
        if (windy.length > 0) {
          const names = windy.map(w => w.Target_DST.split(' ')[0]).join(' & ');
          document.getElementById('kpi-weather-name').textContent = names;
          document.getElementById('kpi-weather-sub').textContent = `High Wind Gusts (INT Boost)`;
        }
      }
    }

    if (appData.lookAheadStashes && appData.lookAheadStashes.length > 0) {
      const topStash = appData.lookAheadStashes[0];
      document.getElementById('kpi-stash-name').textContent = `${topStash.Stash_DST} (Week ${meta.lookAheadWeek})`;
      document.getElementById('kpi-stash-sub').textContent = `${topStash.W10_Opponent} (${topStash.Opp_Last_4} pts L4)`;
    }
  }

  // 3. Navigation Tabs
  function setupNavigation() {
    const tabButtons = document.querySelectorAll('.nav-tab');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        if (target === activeTab) return;

        // Update button states
        tabButtons.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

        // Update panel states
        document.querySelectorAll('.tab-panel').forEach(panel => {
          panel.classList.remove('active');
          panel.hidden = true;
        });

        const activePanel = document.getElementById(`tab-${target}`);
        if (activePanel) {
          activePanel.classList.add('active');
          activePanel.hidden = false;
        }

        activeTab = target;
        document.body.setAttribute('data-active-tab', target);

        const headerKpis = document.querySelector('.app-header .kpi-grid');
        if (headerKpis) {
          headerKpis.style.display = (target === 'audit') ? 'none' : '';
        }

        renderActiveTable();
      });
    });
  }

  // 4. Filter Event Listeners (Removed - no filters)
  function setupFilterEvents() {
    // Search and filter bars removed per user request
  }

  // 5. Sorting Event Listeners
  function setupSortingEvents() {
    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const column = th.dataset.sort;
        const currentSort = sortStates[activeTab];

        if (currentSort.column === column) {
          currentSort.ascending = !currentSort.ascending;
        } else {
          currentSort.column = column;
          currentSort.ascending = false; // default descending for stats
        }

        updateSortHeaders(th.closest('table'), column, currentSort.ascending);
        renderActiveTable();
      });
    });
  }

  function updateSortHeaders(table, activeColumn, ascending) {
    table.querySelectorAll('th[data-sort]').forEach(th => {
      th.classList.remove('sort-active', 'asc', 'desc');
      const arrow = th.querySelector('.sort-arrow');
      if (arrow) arrow.textContent = '';
      
      if (th.dataset.sort === activeColumn) {
        th.classList.add('sort-active', ascending ? 'asc' : 'desc');
        if (arrow) arrow.textContent = ascending ? '▲' : '▼';
      }
    });
  }

  // Helper for sorting
  function sortData(list, column, ascending) {
    return [...list].sort((a, b) => {
      let valA = a[column];
      let valB = b[column];

      // Handle nulls / '-'
      if (valA === '-' || valA === null || valA === undefined || valA === 'BYE') valA = ascending ? 999999 : -999999;
      if (valB === '-' || valB === null || valB === undefined || valB === 'BYE') valB = ascending ? 999999 : -999999;

      const numA = parseFloat(valA);
      const numB = parseFloat(valB);

      if (!isNaN(numA) && !isNaN(numB)) {
        return ascending ? numA - numB : numB - numA;
      }

      // String comparison
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return ascending ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }

  // 6. Master Render Dispatcher
  function renderAll() {
    renderWeek9Projections();
    renderWeek10Stashes();
    renderHistory();
    renderPointsAnatomy();
    renderAuditReport();
  }

  function renderActiveTable() {
    if (activeTab === 'week9') renderWeek9Projections();
    else if (activeTab === 'week10') renderWeek10Stashes();
    else if (activeTab === 'history') renderHistory();
    else if (activeTab === 'anatomy') renderPointsAnatomy();
    else if (activeTab === 'audit') renderAuditReport();
  }

  // 7. Render Tab 1: Week 9 Projections
  function renderWeek9Projections() {
    const tbody = document.getElementById('projections-tbody');
    if (!tbody || !appData.weekMatchups) return;

    // Filter out BYE teams for streaming view
    let rows = appData.weekMatchups.filter(m => m.Target_DST && !m.Target_DST.includes('BYE'));

    // Sort
    const sortConfig = sortStates.week9;
    const keyMap = {
      'Streaming Defense': 'Target_DST',
      'Opponent': 'Offense',
      'Opponent Offense': 'Offense',
      'Opposing QB (Status)': 'Starting_QB',
      'Week 9 Verdict': 'Streamer_Tier',
      'Streaming Tier': 'Streamer_Tier',
      'Opponent Points Allowed L4': 'Last_4_Games',
      'Opponent L4 Points Allowed': 'Last_4_Games',
      'Opponent L4 Pts Allowed': 'Last_4_Games',
      'Opp L4 Pts Allowed': 'Last_4_Games',
      'Opponent Points Allowed Season': 'Total_pts',
      'Opponent Points Allowed (Season)': 'Total_pts',
      'Opponent Szn Pts Allowed': 'Total_pts',
      'Opponent Total Points Allowed': 'Total_pts',
      'Opp Szn Pts Allowed': 'Total_pts',
      'Vegas Implied Opponent Score': 'Opp_Implied_Pts',
      'Vegas Implied': 'Opp_Implied_Pts',
      'Projected Bracket Points': 'Exp_Bracket',
      'Proj Bracket Points': 'Exp_Bracket',
      'Bracket Points': 'Exp_Bracket',
      'Projected Fantasy Points': 'Proj_Fantasy_Pts',
      'Scoring Floor': 'Predicted_Floor',
      'Projected Sacks': 'Proj_Sacks',
      'Projected Interceptions': 'Proj_INTs',
      'Projected Fumbles': 'Proj_Fumbles',
      'Projected Fumbles Recovered': 'Proj_Fumbles',
      'Defensive Quality Index (DQI)': 'Def_DQI',
      'Def Quality Index (DQI)': 'Def_DQI',
      'Def Quality Index (Szn)': 'Def_DQI',
      'Def Quality Index (DQI, Szn)': 'Def_DQI',
      'DQI': 'Def_DQI',
      'Defensive Pressure %': 'Def_Pressure_Rate%',
      'Def Pressure %': 'Def_Pressure_Rate%',
      'Def Pressure % (Szn)': 'Def_Pressure_Rate%',
      'Defensive Pass EPA Allowed': 'Def_Pass_EPA',
      'Def Pass EPA': 'Def_Pass_EPA',
      'Def Pass EPA (Szn)': 'Def_Pass_EPA',
      '3rd Down Stop Rate %': 'Def_3rd_Stop%',
      '3rd Down Stop %': 'Def_3rd_Stop%',
      '3rd Down Stop % (Szn)': 'Def_3rd_Stop%',
      'Takeaway Drive %': 'Def_Takeaway_Drive%',
      'Takeaway Drive % (Szn)': 'Def_Takeaway_Drive%',
      'Punt Drive %': 'Def_Punt_Drive%',
      'Punt Drive % (Szn)': 'Def_Punt_Drive%',
      'Red Zone TD Allowed %': 'Def_RZ_TD_Allowed%',
      'RZ TD Allowed %': 'Def_RZ_TD_Allowed%',
      'RZ TD Allowed % (Szn)': 'Def_RZ_TD_Allowed%',
      'Key Defensive Injuries': 'Def_Injuries',
      'Def Health / Key Injuries': 'Def_Injuries',
      'Def Health / Injuries': 'Def_Injuries',
      'Sack Rate on Pressure %': 'Sacks_Per_Press%',
      'Sacks / Press % (L4)': 'Sacks_Per_Press%',
      'Sacks per Pressure % (L4)': 'Sacks_Per_Press%',
      'QB Fumble Rate %': 'QB_Fumble_Rate%',
      'QB Fumble Rate % (Szn)': 'QB_Fumble_Rate%',
      'QB Fumbles': 'QB_Fumbles',
      'Pass Efficiency Allowed (EPA/Play)': 'Off_Pass_EPA_L4',
      'Opponent Pass EPA (L4)': 'Off_Pass_EPA_L4',
      'Opp Pass EPA (L4)': 'Off_Pass_EPA_L4',
      'Avg Time to Throw (Sec)': 'NGS_TTT',
      'Avg Time to Throw (Szn)': 'NGS_TTT',
      'Tight-Window Throw %': 'NGS_Agg%',
      'Tight-Window Throw % (Szn)': 'NGS_Agg%',
      'Game-Time Kickoff Weather': 'Gametime_Weather'
    };

    const targetKey = keyMap[sortConfig.column] || sortConfig.column;
    rows = sortData(rows, targetKey, sortConfig.ascending);
    currentRenderedWeek9Rows = rows;

    // Render HTML
    tbody.innerHTML = rows.map((r, idx) => {
      const qbDisplay = formatQbCell(r.Starting_QB);
      
      // Weather pill style
      const weatherText = r.Gametime_Weather || 'N/A';
      const isWind = weatherText.toLowerCase().includes('wind') || weatherText.toLowerCase().includes('gust') || weatherText.toLowerCase().includes('breezy');
      const isDome = weatherText.toLowerCase().includes('dome');
      const weatherClass = isWind ? 'weather-wind' : (isDome ? 'weather-dome' : '');
      const weatherIcon = isWind ? '🌬️' : (isDome ? '🏟️' : '☀️');

      // Tier class
      const tierClass = getTierClass(r.Streamer_Tier);

      return `
        <tr data-row-idx="${idx}" class="matchup-row">
          <td class="col-sticky">
            <div class="team-badge">
              <span class="stat-bold">${formatDstLabel(r.Target_DST)}</span>
            </div>
          </td>
          <td>${r.Offense}</td>
          <td>${qbDisplay}</td>
          <td class="col-center"><span class="badge ${tierClass}">${r.Streamer_Tier}</span></td>
          <td class="col-center"><span class="pts-highlight ${parseFloat(r.Last_4_Games) >= 30 ? 'pts-top' : ''}">${r.Last_4_Games} pts</span> <span class="stat-dim">(${(parseFloat(r.Last_4_Games) / 4).toFixed(1)}/g)</span></td>
          <td class="col-center"><span class="stat-bold">${r.Total_pts} pts</span></td>
          <td class="col-center"><span class="pts-highlight ${parseFloat(r.Proj_Fantasy_Pts) >= 9 ? 'pts-top' : ''}">${formatNum(r.Proj_Fantasy_Pts, 1)}</span></td>
          <td class="col-center stat-bold">${formatNum(r.Predicted_Floor, 1)}</td>
          <td class="col-center">${formatNum(r.Proj_Sacks, 1)}</td>
          <td class="col-center ${parseFloat(r.Proj_INTs) >= 1.5 ? 'stat-bold' : ''}">${formatNum(r.Proj_INTs, 1)}</td>
          <td class="col-center">${formatNum(r.Proj_Fumbles, 1)}</td>
          <td class="col-center">${formatNum(r.Opp_Implied_Pts, 1)} pts</td>
          <td class="col-center">${formatNum(r.Exp_Bracket, 1)} pts</td>
          <td class="col-center"><span class="dqi-badge ${getDqiClass(r.Def_DQI)}">${r.Def_DQI !== '-' ? formatNum(r.Def_DQI, 1) : '—'}</span></td>
          <td class="col-center ${parseFloat(r['Def_Pressure_Rate%']) >= 25 ? 'stat-bold pts-top' : (parseFloat(r['Def_Pressure_Rate%']) >= 22.5 ? 'stat-bold' : '')}">${r['Def_Pressure_Rate%'] !== '-' ? formatNum(r['Def_Pressure_Rate%'], 1) + '%' : '—'}</td>
          <td class="col-center ${parseFloat(r.Def_Pass_EPA) < 0 ? 'pts-top stat-bold' : ''}">${r.Def_Pass_EPA !== '-' ? (parseFloat(r.Def_Pass_EPA) > 0 ? '+' : '') + formatNum(r.Def_Pass_EPA, 3) : '—'}</td>
          <td class="col-center ${parseFloat(r['Def_3rd_Stop%']) >= 70 ? 'pts-top stat-bold' : ''}">${r['Def_3rd_Stop%'] !== '-' ? formatNum(r['Def_3rd_Stop%'], 1) + '%' : '—'}</td>
          <td class="col-center ${parseFloat(r['Def_Takeaway_Drive%']) >= 45 ? 'stat-bold' : ''}">${r['Def_Takeaway_Drive%'] !== '-' ? formatNum(r['Def_Takeaway_Drive%'], 1) + '%' : '—'}</td>
          <td class="col-center ${parseFloat(r['Def_Punt_Drive%']) >= 40 ? 'stat-bold' : ''}">${r['Def_Punt_Drive%'] !== '-' ? formatNum(r['Def_Punt_Drive%'], 1) + '%' : '—'}</td>
          <td class="col-center ${parseFloat(r['Def_RZ_TD_Allowed%']) <= 25 ? 'pts-top stat-bold' : ''}">${r['Def_RZ_TD_Allowed%'] !== '-' ? formatNum(r['Def_RZ_TD_Allowed%'], 1) + '%' : '—'}</td>
          <td>${formatInjuryCell(r.Def_Injuries)}</td>
          <td class="col-center">${formatNum(r['Sacks_Per_Press%'], 1)}%</td>
          <td class="col-center ${parseFloat(r['QB_Fumble_Rate%']) >= 2.5 ? 'pts-top stat-bold' : ''}" title="${r.QB_Fumbles !== undefined ? r.QB_Fumbles + ' total fumbles' : ''}">${r['QB_Fumble_Rate%'] !== undefined && r['QB_Fumble_Rate%'] !== '-' ? formatNum(r['QB_Fumble_Rate%'], 1) + '%' : '—'}</td>
          <td class="col-center ${parseFloat(r.Off_Pass_EPA_L4) < 0 ? 'pts-top' : ''}">${parseFloat(r.Off_Pass_EPA_L4) > 0 ? '+' : ''}${formatNum(r.Off_Pass_EPA_L4, 3)}</td>
          <td class="col-center">${r.NGS_TTT !== '-' ? formatNum(r.NGS_TTT, 2) + 's' : '—'}</td>
          <td class="col-center">${r['NGS_Agg%'] !== '-' ? formatNum(r['NGS_Agg%'], 1) + '%' : '—'}</td>
          <td><span class="weather-pill ${weatherClass}">${weatherIcon} ${weatherText}</span></td>
          <td class="col-rationale">${formatRationaleCell(r.Current_Week_Rationale)}</td>
        </tr>
      `;
    }).join('');

    // Render Mobile Card View for Week 9
    const cardsContainer = document.getElementById('week9-cards-container');
    if (cardsContainer) {
      cardsContainer.innerHTML = rows.map((r, idx) => {
        const qbDisplay = formatQbCell(r.Starting_QB);
        const weatherText = r.Gametime_Weather || 'N/A';
        const isWind = weatherText.toLowerCase().includes('wind') || weatherText.toLowerCase().includes('gust') || weatherText.toLowerCase().includes('breezy');
        const isDome = weatherText.toLowerCase().includes('dome');
        const weatherClass = isWind ? 'weather-wind' : (isDome ? 'weather-dome' : '');
        const weatherIcon = isWind ? '🌬️' : (isDome ? '🏟️' : '☀️');
        const tierClass = getTierClass(r.Streamer_Tier);

        return `
          <article class="mobile-matchup-card" data-row-idx="${idx}">
            <div class="m-card-header">
              <div class="m-card-title-group">
                <span class="m-card-team">${formatDstLabel(r.Target_DST)} <small style="font-weight:500; opacity:0.85;">vs ${r.Offense}</small></span>
                <span class="badge ${tierClass}">${r.Streamer_Tier}</span>
              </div>
              <div class="m-card-pts-box">
                <span class="m-card-pts ${parseFloat(r.Proj_Fantasy_Pts) >= 9 ? 'pts-top' : ''}">${formatNum(r.Proj_Fantasy_Pts, 1)} <small>PTS</small></span>
                <span class="m-card-floor">Floor: <strong>${formatNum(r.Predicted_Floor, 1)}</strong></span>
              </div>
            </div>
            <div class="m-card-context-row">
              <div class="m-card-qb">${qbDisplay}</div>
              <div class="m-card-env">
                <span class="weather-pill ${weatherClass}">${weatherIcon} ${weatherText}</span>
              </div>
            </div>
            <div class="m-card-opp-row" style="display:flex; justify-content:space-between; font-size:0.82rem; padding: 4px 8px; margin-bottom: 8px; background: rgba(255,255,255,0.03); border-radius: 4px;">
              <span>Opponent: <strong>${r.Offense}</strong></span>
              <span>L4 Yield: <strong>${r.Last_4_Games} pts</strong> (${(r.Last_4_Games / 4).toFixed(1)}/g) • Szn: <strong>${r.Total_pts} pts</strong></span>
            </div>
            <div class="m-card-stats-grid">
              <div class="m-stat-box">
                <span class="m-stat-lbl">Proj Sacks</span>
                <span class="m-stat-val">${formatNum(r.Proj_Sacks, 1)}</span>
              </div>
              <div class="m-stat-box">
                <span class="m-stat-lbl">INT / Fum</span>
                <span class="m-stat-val">${formatNum(r.Proj_INTs, 1)} / ${formatNum(r.Proj_Fumbles, 1)}</span>
              </div>
              <div class="m-stat-box">
                <span class="m-stat-lbl">Vegas Pts</span>
                <span class="m-stat-val">${formatNum(r.Opp_Implied_Pts, 1)}</span>
              </div>
              <div class="m-stat-box">
                <span class="m-stat-lbl">Def DQI</span>
                <span class="m-stat-val"><span class="dqi-badge ${getDqiClass(r.Def_DQI)}">${r.Def_DQI !== '-' ? formatNum(r.Def_DQI, 1) : '—'}</span></span>
              </div>
            </div>
            <div class="m-card-footer">
              <p class="m-card-snippet">${r.Current_Week_Rationale || 'Standard matchup projection.'}</p>
              <button type="button" class="btn-rationale m-card-btn">Full Analysis & All Stats ➔</button>
            </div>
          </article>
        `;
      }).join('');
    }
  }

  // 8. Render Tab 2: Week 10 Look-Ahead Stashes
  function renderWeek10Stashes() {
    const tbody = document.getElementById('stashes-tbody');
    if (!tbody || !appData.lookAheadStashes) return;

    let rows = [...appData.lookAheadStashes];

    const sortConfig = sortStates.week10;
    const keyMap = {
      'Defense': 'Stash_DST',
      'Stash Defense': 'Stash_DST',
      'Week 10 Opponent': 'W10_Opponent',
      'Week 10 Verdict': 'Tier_Rank',
      'Def Quality Index (DQI)': 'Stash_DQI',
      'Def Quality Index (Szn)': 'Stash_DQI',
      'Defensive Quality Index (DQI)': 'Stash_DQI',
      'DQI': 'Stash_DQI',
      'Def Pressure %': 'Def_Pressure_Rate%',
      'Def Pressure % (Szn)': 'Def_Pressure_Rate%',
      'Def Pass EPA': 'Def_Pass_EPA',
      'Def Pass EPA (Szn)': 'Def_Pass_EPA',
      '3rd Down Stop %': 'Def_3rd_Stop%',
      '3rd Down Stop % (Szn)': 'Def_3rd_Stop%',
      'Takeaway Drive %': 'Def_Takeaway_Drive%',
      'Takeaway Drive % (Szn)': 'Def_Takeaway_Drive%',
      'RZ TD Allowed %': 'Def_RZ_TD_Allowed%',
      'RZ TD Allowed % (Szn)': 'Def_RZ_TD_Allowed%',
      'Opponent L4 Points Allowed': 'Opp_Last_4',
      'Opponent Total Points Allowed': 'Opp_Total_Pts',
      'Opponent Total Pts (Szn)': 'Opp_Total_Pts',
      'Opponent Starting QB': 'Opp_QB'
    };
    const targetKey = keyMap[sortConfig.column] || sortConfig.column;
    rows = sortData(rows, targetKey, sortConfig.ascending);
    currentRenderedWeek10Rows = rows;

    tbody.innerHTML = rows.map((s, idx) => {
      const tierBadgeClass = getTierClass(s.Stash_Tier);
      const mobileOpp = s.W10_Opponent_Mobile || s.W10_Opponent;
      return `
        <tr data-stash-idx="${idx}" class="stash-row">
          <td class="col-sticky"><span class="stat-bold">${s.Stash_DST}</span></td>
          <td><span class="team-desktop">${s.W10_Opponent}</span><span class="team-mobile stat-bold">${mobileOpp}</span></td>
          <td class="col-center"><span class="badge ${tierBadgeClass}">${s.Stash_Tier || 'Neutral'}</span></td>
          <td class="col-center"><span class="dqi-badge ${getDqiClass(s.Stash_DQI)}">${s.Stash_DQI !== undefined && s.Stash_DQI !== null && s.Stash_DQI !== '-' ? formatNum(s.Stash_DQI, 1) : '—'}</span></td>
          <td class="col-center ${parseFloat(s['Def_Pressure_Rate%']) >= 25 ? 'stat-bold pts-top' : (parseFloat(s['Def_Pressure_Rate%']) >= 22.5 ? 'stat-bold' : '')}">${s['Def_Pressure_Rate%'] !== undefined && s['Def_Pressure_Rate%'] !== '-' ? formatNum(s['Def_Pressure_Rate%'], 1) + '%' : '—'}</td>
          <td class="col-center ${parseFloat(s.Def_Pass_EPA) < 0 ? 'pts-top stat-bold' : ''}">${s.Def_Pass_EPA !== undefined && s.Def_Pass_EPA !== '-' ? (parseFloat(s.Def_Pass_EPA) > 0 ? '+' : '') + formatNum(s.Def_Pass_EPA, 3) : '—'}</td>
          <td class="col-center ${parseFloat(s['Def_3rd_Stop%']) >= 70 ? 'pts-top stat-bold' : ''}">${s['Def_3rd_Stop%'] !== undefined && s['Def_3rd_Stop%'] !== '-' ? formatNum(s['Def_3rd_Stop%'], 1) + '%' : '—'}</td>
          <td class="col-center ${parseFloat(s['Def_Takeaway_Drive%']) >= 45 ? 'stat-bold' : ''}">${s['Def_Takeaway_Drive%'] !== undefined && s['Def_Takeaway_Drive%'] !== '-' ? formatNum(s['Def_Takeaway_Drive%'], 1) + '%' : '—'}</td>
          <td class="col-center ${parseFloat(s['Def_RZ_TD_Allowed%']) <= 25 ? 'pts-top stat-bold' : ''}">${s['Def_RZ_TD_Allowed%'] !== undefined && s['Def_RZ_TD_Allowed%'] !== '-' ? formatNum(s['Def_RZ_TD_Allowed%'], 1) + '%' : '—'}</td>
          <td class="col-center"><span class="pts-highlight ${s.Opp_Last_4 >= 30 ? 'pts-top' : ''}">${s.Opp_Last_4} pts</span> <span class="stat-dim">(${(s.Opp_Last_4 / 4).toFixed(1)}/g)</span></td>
          <td class="col-center"><span class="stat-bold">${s.Opp_Total_Pts} pts</span></td>
          <td>${s.Opp_QB}</td>
          <td class="col-rationale">${formatRationaleCell(s.Look_Ahead_Rationale)}</td>
        </tr>
      `;
    }).join('');

    // Render Mobile Card View for Week 10 Stashes
    const w10CardsContainer = document.getElementById('week10-cards-container');
    if (w10CardsContainer) {
      w10CardsContainer.innerHTML = rows.map((s, idx) => {
        const tierBadgeClass = getTierClass(s.Stash_Tier);
        const mobileOpp = s.W10_Opponent_Mobile || s.W10_Opponent;
        const matchupLabel = mobileOpp.startsWith('@') ? `(${mobileOpp})` : `vs ${mobileOpp}`;
        return `
          <article class="mobile-matchup-card stash-mobile-card" data-stash-idx="${idx}">
            <div class="m-card-header">
              <div class="m-card-title-group">
                <span class="m-card-team">${s.Stash_DST} <small style="font-weight:500; opacity:0.85;">${matchupLabel}</small></span>
                <span class="badge ${tierBadgeClass}">${s.Stash_Tier || 'Neutral'}</span>
              </div>
              <div class="m-card-pts-box">
                <span class="m-card-pts ${s.Opp_Last_4 >= 30 ? 'pts-top' : ''}">${s.Opp_Last_4} <small>L4 PTS</small></span>
                <span class="m-card-floor">Avg: <strong>${(s.Opp_Last_4 / 4).toFixed(1)}/g</strong></span>
              </div>
            </div>
            <div class="m-card-context-row">
              <div class="m-card-qb"><strong>Opp QB:</strong> ${s.Opp_QB}</div>
              <div class="m-card-env"><strong>Szn Yield:</strong> ${s.Opp_Total_Pts} pts</div>
            </div>
            <div class="m-card-stats-grid">
              <div class="m-stat-box">
                <span class="m-stat-lbl">Def DQI</span>
                <span class="m-stat-val"><span class="dqi-badge ${getDqiClass(s.Stash_DQI)}">${s.Stash_DQI !== undefined && s.Stash_DQI !== '-' ? formatNum(s.Stash_DQI, 1) : '—'}</span></span>
              </div>
              <div class="m-stat-box">
                <span class="m-stat-lbl">Pressure %</span>
                <span class="m-stat-val">${s['Def_Pressure_Rate%'] !== undefined && s['Def_Pressure_Rate%'] !== '-' ? formatNum(s['Def_Pressure_Rate%'], 1) + '%' : '—'}</span>
              </div>
              <div class="m-stat-box">
                <span class="m-stat-lbl">3rd Stop %</span>
                <span class="m-stat-val">${s['Def_3rd_Stop%'] !== undefined && s['Def_3rd_Stop%'] !== '-' ? formatNum(s['Def_3rd_Stop%'], 1) + '%' : '—'}</span>
              </div>
              <div class="m-stat-box">
                <span class="m-stat-lbl">Takeaway %</span>
                <span class="m-stat-val">${s['Def_Takeaway_Drive%'] !== undefined && s['Def_Takeaway_Drive%'] !== '-' ? formatNum(s['Def_Takeaway_Drive%'], 1) + '%' : '—'}</span>
              </div>
            </div>
            <div class="m-card-footer">
              <p class="m-card-snippet">${s.Look_Ahead_Rationale || 'Look-ahead stash analysis.'}</p>
              <button type="button" class="btn-rationale m-card-btn">Full Stash Analysis & Stats ➔</button>
            </div>
          </article>
        `;
      }).join('');
    }
  }

  function getStashBadgeClass(tier) {
    return getTierClass(tier);
  }

  // 9. Render Tab 3: Historical Offense Vulnerability (W1–W8)
  function renderHistory() {
    const tbody = document.getElementById('history-tbody');
    if (!tbody || !appData.historicalOffenses) return;

    let rows = [...appData.historicalOffenses];

    const sortConfig = sortStates.history;
    const keyMap = {
      'Offense': 'Offense',
      'Week 1': 'W1', 'Week 2': 'W2', 'Week 3': 'W3', 'Week 4': 'W4',
      'Week 5': 'W5', 'Week 6': 'W6', 'Week 7': 'W7', 'Week 8': 'W8',
      'Last 2 Games Played': 'Last_2_Games',
      'Last 4 Games Played': 'Last_4_Games',
      'Total Points Allowed (W1-8)': 'Total_pts',
      'Streaming Defense': 'Target_DST',
      'Quarterback & Status': 'Starting_QB',
      'Week 9 Verdict': 'Streamer_Tier',
      'Streaming Tier': 'Streamer_Tier'
    };
    const targetKey = keyMap[sortConfig.column] || sortConfig.column;
    rows = sortData(rows, targetKey, sortConfig.ascending);

    tbody.innerHTML = rows.map(h => {
      const isBackup = h.Starting_QB && h.Starting_QB.includes('Yes');
      const tierClass = getTierClass(h.Streamer_Tier);

      return `
        <tr>
          <td class="col-sticky"><span class="stat-bold team-desktop">${h.Offense}</span><span class="stat-bold team-mobile">${h.Team || h.Offense}</span></td>
          ${renderHeatCell(h.W1)}
          ${renderHeatCell(h.W2)}
          ${renderHeatCell(h.W3)}
          ${renderHeatCell(h.W4)}
          ${renderHeatCell(h.W5)}
          ${renderHeatCell(h.W6)}
          ${renderHeatCell(h.W7)}
          ${renderHeatCell(h.W8)}
          <td class="col-center"><span class="stat-bold ${h.Last_2_Games >= 15 ? 'pts-top' : ''}">${h.Last_2_Games}</span></td>
          <td class="col-center"><span class="stat-bold ${h.Last_4_Games >= 30 ? 'pts-top' : ''}">${h.Last_4_Games}</span></td>
          <td class="col-center"><span class="pts-highlight ${h.Total_pts >= 45 ? 'pts-top' : ''}">${h.Total_pts}</span></td>
          <td>${formatDstLabel(h.Target_DST) || 'BYE'}</td>
          <td>${formatQbCell(h.Starting_QB)}</td>
          <td class="col-center"><span class="badge ${tierClass}">${h.Streamer_Tier || 'BYE'}</span></td>
        </tr>
      `;
    }).join('');
  }

  function renderHeatCell(val) {
    if (val === 'BYE') return `<td class="stat-dim col-wk">BYE</td>`;
    const num = parseFloat(val);
    if (isNaN(num)) return `<td class="col-wk">${val}</td>`;

    // Standard Microsoft Excel Red - White - Blue conditional formatting scale:
    // Red for Poor (High points yielded to D/ST: 7 to 21+)
    // White for Neutral (Average points yielded: 3 to 6)
    // Blue for Good (Low points yielded to D/ST: 0 to 2)
    const mid = 4.5;
    const maxVal = 14.0;
    let bg, textColor;

    if (num <= mid) {
      // Interpolate from Rich Blue (0 pts) to White (4.5 pts)
      const ratio = num / mid;
      const r = Math.round(37 + (255 - 37) * ratio);
      const g = Math.round(99 + (255 - 99) * ratio);
      const b = 255;
      bg = `rgb(${r}, ${g}, ${b})`;
      textColor = ratio < 0.45 ? '#ffffff' : '#0f172a';
    } else {
      // Interpolate from White (4.5 pts) to Rich Red (14+ pts)
      const ratio = Math.min(1.0, (num - mid) / (maxVal - mid));
      const r = 255;
      const g = Math.round(255 - (255 - 38) * ratio);
      const b = Math.round(255 - (255 - 38) * ratio);
      bg = `rgb(${r}, ${g}, ${b})`;
      textColor = ratio < 0.45 ? '#0f172a' : '#ffffff';
    }

    return `<td class="col-wk excel-cell" style="background-color: ${bg} !important; color: ${textColor} !important; font-weight: 700;">${num}</td>`;
  }

  // 10. Render Tab 4: D/ST Fantasy Points Anatomy (Weeks 1-8)
  function renderPointsAnatomy() {
    const tbody = document.getElementById('anatomy-tbody');
    if (!tbody || !appData.pointsAnatomy) return;

    let rows = [...appData.pointsAnatomy];

    const sortConfig = sortStates.anatomy;
    const keyMap = {
      'Team': 'Team',
      'NFL Defense': 'Team',
      'Games Played': 'GP',
      'GP': 'GP',
      'Total Fantasy Points': 'Total_Pts',
      'Total_Pts': 'Total_Pts',
      'Fantasy PPG': 'PPG',
      'PPG': 'PPG',
      'Sacks': 'Sacks',
      'Points Allowed Bracket': 'Bracket_Pts',
      'Bracket_Pts': 'Bracket_Pts',
      'INTs': 'INTs',
      'Fumbles Rec': 'Fumbles_Rec',
      'Fumbles_Rec': 'Fumbles_Rec',
      'Blocks': 'Blocks',
      'Def TDs': 'Def_TDs',
      'Def_TDs': 'Def_TDs',
      'Safeties': 'Safeties'
    };
    const targetKey = keyMap[sortConfig.column] || sortConfig.column;
    rows = sortData(rows, targetKey, sortConfig.ascending);

    tbody.innerHTML = rows.map(r => {
      return `
        <tr>
          <td class="col-sticky"><span class="team-desktop"><span class="stat-bold">${r.Team_Name || r.Team}</span> <span class="stat-dim">(${r.Team})</span></span><span class="stat-bold team-mobile">${r.Team}</span></td>
          <td class="col-center">${r.GP}</td>
          <td class="col-center stat-bold pts-top">${formatNum(r.PPG, 1)}</td>
          <td class="col-center"><span class="pts-highlight">${r.Total_Pts} pts</span></td>
          <td class="col-center"><span class="stat-bold">${r.Sacks}</span> <span class="stat-dim">(${r.Sack_Pts} pts • ${formatNum(r.Sack_Pct, 1)}%)</span></td>
          <td class="col-center"><span class="stat-bold">${r.Bracket_Pts} pts</span> <span class="stat-dim">(${formatNum(r.Bracket_Pct, 1)}%)</span></td>
          <td class="col-center"><span class="stat-bold">${r.INTs}</span> <span class="stat-dim">(${r.INT_Pts} pts • ${formatNum(r.INT_Pct, 1)}%)</span></td>
          <td class="col-center"><span class="stat-bold">${r.Fumbles_Rec}</span> <span class="stat-dim">(${r.Fumble_Pts} pts • ${formatNum(r.Fumble_Pct, 1)}%)</span></td>
          <td class="col-center"><span class="stat-bold">${r.Blocks || 0}</span> <span class="stat-dim">(${r.Block_Pts || 0} pts • ${formatNum(r.Block_Pct || 0, 1)}%)</span></td>
          <td class="col-center"><span class="stat-bold">${r.Def_TDs}</span> <span class="stat-dim">(${r.TD_Pts} pts • ${formatNum(r.TD_Pct, 1)}%)</span></td>
          <td class="col-center"><span class="stat-bold">${r.Safeties}</span> <span class="stat-dim">(${r.Safety_Pts} pts)</span></td>
          <td>
            <div class="dist-bar-wrap" title="Sacks: ${r.Sack_Pct}%, Bracket: ${r.Bracket_Pct}%, INTs: ${r.INT_Pct}%, Fumbles: ${r.Fumble_Pct}%, Blocks: ${r.Block_Pct || 0}%, TDs: ${r.TD_Pct}%">
              <div class="dist-seg seg-sack" style="width: ${r.Sack_Pct}%;"></div>
              <div class="dist-seg seg-bracket" style="width: ${r.Bracket_Pct}%;"></div>
              <div class="dist-seg seg-int" style="width: ${r.INT_Pct}%;"></div>
              <div class="dist-seg seg-fumb" style="width: ${r.Fumble_Pct}%;"></div>
              <div class="dist-seg seg-block" style="width: ${r.Block_Pct || 0}%;"></div>
              <div class="dist-seg seg-td" style="width: ${r.TD_Pct}%;"></div>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 11. Render Tab 6: Model Audit & Report Card
  function renderAuditReport() {
    if (!appData) return;

    const auditData = appData.audit || {};
    const activeSnap = auditData.activeSnapshot || null;
    const completedAudits = auditData.completedAudits || [];

    // 1. Populate Snapshot Transparency Ledger
    if (activeSnap) {
      const statusEl = document.getElementById('audit-ledger-status');
      if (statusEl) {
        statusEl.textContent = completedAudits.length > 0 ? `✅ Week ${activeSnap.week} Audited` : `⏳ Week ${activeSnap.week} Baseline Locked`;
        statusEl.className = `ledger-badge ${completedAudits.length > 0 ? 'badge-priority' : 'badge-speculative'}`;
      }
      const idEl = document.getElementById('audit-ledger-id');
      if (idEl) idEl.textContent = activeSnap.snapshot_id || '2026_week_09';
      const timeEl = document.getElementById('audit-ledger-time');
      if (timeEl) timeEl.textContent = activeSnap.timestamp_local || 'November 06, 2026 at 10:12 AM';
      const commitEl = document.getElementById('audit-ledger-commit');
      if (commitEl) commitEl.textContent = (activeSnap.git_commit_hash || '').slice(0, 10);
      const shaEl = document.getElementById('audit-ledger-sha');
      if (shaEl) shaEl.textContent = (activeSnap.sha256 || '').slice(0, 16) + '...';
      const countEl = document.getElementById('audit-ledger-count');
      if (countEl) countEl.textContent = `${activeSnap.records_count || 30} Active Defenses`;
    }

    // 2. Cumulative Season KPIs
    const maeEl = document.getElementById('audit-kpi-mae');
    const priorityEl = document.getElementById('audit-kpi-priority');
    const floorEl = document.getElementById('audit-kpi-floor');
    const matchupsEl = document.getElementById('audit-kpi-matchups');

    if (completedAudits.length > 0) {
      // Real mathematical aggregations across all completed audits
      const totalMatchups = completedAudits.reduce((acc, a) => acc + (a.summary.total_matchups || 0), 0);
      const weightedMae = (completedAudits.reduce((acc, a) => acc + (a.summary.mae * a.summary.total_matchups), 0) / (totalMatchups || 1)).toFixed(2);
      const avgPriorityHit = (completedAudits.reduce((acc, a) => acc + (a.summary.priority_hit_rate_pct || 0), 0) / completedAudits.length).toFixed(1);
      const avgFloorRel = (completedAudits.reduce((acc, a) => acc + (a.summary.floor_reliability_pct || 0), 0) / completedAudits.length).toFixed(1);

      if (maeEl) maeEl.textContent = `${weightedMae} pts`;
      if (priorityEl) priorityEl.textContent = `${avgPriorityHit}%`;
      if (floorEl) floorEl.textContent = `${avgFloorRel}%`;
      if (matchupsEl) matchupsEl.textContent = `${totalMatchups} (${completedAudits.length} wks)`;
    } else {
      // Pre-game zero-hardcoding state: strictly grounded in live status
      if (maeEl) maeEl.textContent = 'Pending';
      if (priorityEl) priorityEl.textContent = 'Pending';
      if (floorEl) floorEl.textContent = 'Pending';
      if (matchupsEl) matchupsEl.textContent = `0 Audited (W9 Locked)`;
    }

    // 3. Weekly Report Cards Summary Table
    const summaryTbody = document.getElementById('audit-summary-tbody');
    if (summaryTbody) {
      let summaryRowsHtml = '';

      // Completed weeks from audits/
      completedAudits.forEach(aud => {
        const gradeClass = (aud.summary.weekly_letter_grade || '').startsWith('A') ? 'badge-priority' : ((aud.summary.weekly_letter_grade || '').startsWith('B') ? 'badge-speculative' : 'badge-neutral');
        summaryRowsHtml += `
          <tr>
            <td class="stat-bold">Week ${aud.week}</td>
            <td><span class="badge badge-priority">✅ Finalized</span></td>
            <td>${aud.summary.priority_teams || '—'}</td>
            <td class="col-center stat-bold">${formatNum(aud.summary.priority_avg_proj, 1)} / ${formatNum(aud.summary.priority_avg_actual, 1)} pts</td>
            <td class="col-center"><span class="pts-highlight">${formatNum(aud.summary.priority_hit_rate_pct, 1)}%</span></td>
            <td class="col-center stat-bold">${formatNum(aud.summary.mae, 2)} pts</td>
            <td class="col-center">${formatNum(aud.summary.floor_reliability_pct, 1)}%</td>
            <td class="col-center"><span class="badge ${gradeClass}">${aud.summary.weekly_letter_grade}</span></td>
          </tr>
        `;
      });

      // Current In-Progress / Locked Week (Week 9)
      const activeWeek = (appData.meta && appData.meta.currentWeek) || 9;
      const isCurrentAudited = completedAudits.some(a => a.week === activeWeek);

      if (!isCurrentAudited && appData.weekMatchups) {
        const activeMatchups = appData.weekMatchups.filter(m => m.Target_DST && !m.Target_DST.includes('BYE'));
        const priorityList = activeMatchups.filter(m => m.Streamer_Tier === 'Priority');
        const priorityNames = priorityList.map(m => m.Target_DST.split(' ')[0]).join(', ');
        const avgPriorityProj = priorityList.length > 0 ? (priorityList.reduce((acc, m) => acc + (parseFloat(m.Proj_Fantasy_Pts) || 0), 0) / priorityList.length).toFixed(1) : '—';

        summaryRowsHtml += `
          <tr>
            <td class="stat-bold">Week ${activeWeek}</td>
            <td><span class="badge badge-speculative">⏳ Games In Progress</span></td>
            <td>${priorityNames || '—'}</td>
            <td class="col-center stat-bold">${avgPriorityProj} pts / Pending</td>
            <td class="col-center stat-dim">Awaiting final</td>
            <td class="col-center stat-dim">Awaiting final</td>
            <td class="col-center stat-dim">Awaiting final</td>
            <td class="col-center"><span class="badge badge-neutral">In Progress</span></td>
          </tr>
        `;
      }

      summaryTbody.innerHTML = summaryRowsHtml;
    }

    // 4. Granular Team-by-Team Reconciliation Table
    const matchupsTbody = document.getElementById('audit-matchups-tbody');
    if (matchupsTbody && appData.weekMatchups) {
      const activeMatchups = appData.weekMatchups.filter(m => m.Target_DST && !m.Target_DST.includes('BYE'));

      // Check if we have a completed audit for this week
      const currentWeekNum = (appData.meta && appData.meta.currentWeek) || 9;
      const weekAudit = completedAudits.find(a => a.week === currentWeekNum);

      let enrichedRows = activeMatchups.map(r => {
        const targetCode = r.Target_DST ? r.Target_DST.split(' ')[0] : '';
        const match = weekAudit && weekAudit.matchup_reconciliation ? 
          weekAudit.matchup_reconciliation.find(m => m.dst === targetCode) : null;
        
        const toProj = (parseFloat(r.Proj_INTs || 0) + parseFloat(r.Proj_Fumbles || 0));
        const projSacks = parseFloat(match ? match.proj_sacks : r.Proj_Sacks) || 0;
        const projTO = parseFloat(match ? match.proj_to : toProj) || 0;
        const projBracket = parseFloat(match ? match.proj_bracket : r.Exp_Bracket) || 0;
        const totalProj = parseFloat(match ? match.proj_pts : r.Proj_Fantasy_Pts) || 0;
        const projOther = match && match.proj_other !== undefined ? 
          parseFloat(match.proj_other) : Math.max(0, parseFloat((totalProj - (projSacks + projTO + projBracket)).toFixed(1)));
        const actualOther = match && match.actual_other !== undefined ? parseFloat(match.actual_other) : null;

        return {
          ...r,
          _auditMatch: match,
          _projPts: totalProj,
          _actualPts: match && match.actual_pts !== undefined ? match.actual_pts : null,
          _projError: match && match.error_diff !== undefined ? match.error_diff : null,
          _floor: parseFloat(match ? match.floor : r.Predicted_Floor) || 0,
          _floorMet: match ? (match.floor_met ? 1 : 0) : null,
          _projSacks: projSacks,
          _projTO: projTO,
          _projBracket: projBracket,
          _projOther: projOther,
          _actualOther: actualOther,
          _outcome: match ? (match.hit ? 'HIT' : 'MISS') : 'Pending'
        };
      });

      // Sort according to active audit sort state (defaults to Projected Points descending)
      const sortConfig = sortStates.audit || { column: 'Projected Points', ascending: false };
      const keyMap = {
        'Streaming Defense': 'Target_DST',
        'Opponent': 'Offense',
        'Week Verdict': 'Streamer_Tier',
        'Projected Points': '_projPts',
        'Actual Fantasy Pts': '_actualPts',
        'Projection Error': '_projError',
        'Floor': '_floor',
        'Floor Met?': '_floorMet',
        'Sacks (Proj / Act)': '_projSacks',
        'Turnovers (Proj / Act)': '_projTO',
        'Bracket (Proj / Act)': '_projBracket',
        'Other (Proj / Act)': '_projOther',
        'Outcome': '_outcome'
      };
      const targetKey = keyMap[sortConfig.column] || '_projPts';
      enrichedRows = sortData(enrichedRows, targetKey, sortConfig.ascending);

      matchupsTbody.innerHTML = enrichedRows.map(r => {
        const tierClass = getTierClass(r.Streamer_Tier);
        const match = r._auditMatch;

        if (match) {
          const errorSign = match.error_diff > 0 ? '+' : '';
          const errorClass = Math.abs(match.error_diff) <= 2.5 ? 'pts-top' : (Math.abs(match.error_diff) >= 5.0 ? 'stat-dim' : '');
          return `
            <tr>
              <td class="col-sticky"><span class="stat-bold">${formatDstLabel(r.Target_DST)}</span></td>
              <td>${r.Offense}</td>
              <td class="col-center"><span class="badge ${tierClass}">${r.Streamer_Tier}</span></td>
              <td class="col-center stat-bold">${formatNum(match.proj_pts, 1)}</td>
              <td class="col-center pts-highlight">${formatNum(match.actual_pts, 1)}</td>
              <td class="col-center stat-bold ${errorClass}">${errorSign}${formatNum(match.error_diff, 1)}</td>
              <td class="col-center stat-dim">${formatNum(match.floor, 1)}</td>
              <td class="col-center">${match.floor_met ? '✅ Yes' : '❌ No'}</td>
              <td class="col-center">${formatNum(match.proj_sacks, 1)} / ${match.actual_sacks}</td>
              <td class="col-center">${formatNum(match.proj_to, 1)} / ${match.actual_to}</td>
              <td class="col-center">${formatNum(match.proj_bracket, 1)} / ${match.actual_bracket}</td>
              <td class="col-center">${formatNum(r._projOther, 1)} / ${formatNum(r._actualOther !== null ? r._actualOther : 0, 1)}</td>
              <td class="col-center"><span class="badge ${match.hit ? 'badge-priority' : 'badge-avoid'}">${match.hit ? 'HIT' : 'MISS'}</span></td>
            </tr>
          `;
        }

        // Pre-game active view: strictly truth-grounded in locked snapshot
        const toProj = (parseFloat(r.Proj_INTs || 0) + parseFloat(r.Proj_Fumbles || 0)).toFixed(1);
        return `
          <tr>
            <td class="col-sticky"><span class="stat-bold">${formatDstLabel(r.Target_DST)}</span></td>
            <td>${r.Offense}</td>
            <td class="col-center"><span class="badge ${tierClass}">${r.Streamer_Tier}</span></td>
            <td class="col-center stat-bold pts-highlight">${formatNum(r.Proj_Fantasy_Pts, 1)}</td>
            <td class="col-center"><span class="badge badge-neutral">⏳ Game Pending</span></td>
            <td class="col-center stat-dim">—</td>
            <td class="col-center stat-bold">${formatNum(r.Predicted_Floor, 1)}</td>
            <td class="col-center stat-dim">Awaiting final</td>
            <td class="col-center">${formatNum(r.Proj_Sacks, 1)} / —</td>
            <td class="col-center">${toProj} / —</td>
            <td class="col-center">${formatNum(r.Exp_Bracket, 1)} / —</td>
            <td class="col-center">${formatNum(r._projOther, 1)} / —</td>
            <td class="col-center"><span class="badge badge-neutral">Pending</span></td>
          </tr>
        `;
      }).join('');
    }
  }

  // 12. Modal & Mobile View Logic
  function setupModalEvents() {
    const modal = document.getElementById('rationale-modal');
    const closeBtn = document.getElementById('modal-close-btn');

    if (closeBtn) closeBtn.addEventListener('click', () => modal.close());
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.close();
      });
    }

    // Clicking anywhere on a Week 9 matchup row opens the comprehensive strategic breakdown
    const tbody = document.getElementById('projections-tbody');
    if (tbody) {
      tbody.addEventListener('click', (e) => {
        const row = e.target.closest('tr.matchup-row');
        if (row && row.dataset.rowIdx !== undefined) {
          const idx = parseInt(row.dataset.rowIdx, 10);
          if (currentRenderedWeek9Rows && currentRenderedWeek9Rows[idx]) {
            openModal(currentRenderedWeek9Rows[idx]);
          }
        }
      });
    }

    // Clicking anywhere on a Week 9 mobile card opens the modal
    const w9Cards = document.getElementById('week9-cards-container');
    if (w9Cards) {
      w9Cards.addEventListener('click', (e) => {
        const card = e.target.closest('.mobile-matchup-card');
        if (card && card.dataset.rowIdx !== undefined) {
          const idx = parseInt(card.dataset.rowIdx, 10);
          if (currentRenderedWeek9Rows && currentRenderedWeek9Rows[idx]) {
            openModal(currentRenderedWeek9Rows[idx]);
          }
        }
      });
    }

    // Clicking anywhere on a Week 10 stash row opens the stash modal
    const stashesTbody = document.getElementById('stashes-tbody');
    if (stashesTbody) {
      stashesTbody.addEventListener('click', (e) => {
        const row = e.target.closest('tr.stash-row');
        if (row && row.dataset.stashIdx !== undefined) {
          const idx = parseInt(row.dataset.stashIdx, 10);
          if (currentRenderedWeek10Rows && currentRenderedWeek10Rows[idx]) {
            openStashModal(currentRenderedWeek10Rows[idx]);
          }
        }
      });
    }

    // Clicking anywhere on a Week 10 mobile card opens the stash modal
    const w10Cards = document.getElementById('week10-cards-container');
    if (w10Cards) {
      w10Cards.addEventListener('click', (e) => {
        const card = e.target.closest('.stash-mobile-card');
        if (card && card.dataset.stashIdx !== undefined) {
          const idx = parseInt(card.dataset.stashIdx, 10);
          if (currentRenderedWeek10Rows && currentRenderedWeek10Rows[idx]) {
            openStashModal(currentRenderedWeek10Rows[idx]);
          }
        }
      });
    }

    // Mobile View Mode Toggles (Cards vs Full Table)
    document.querySelectorAll('.m-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        const target = btn.dataset.target;
        const section = document.getElementById(`tab-${target}`);
        if (section) {
          section.setAttribute('data-mobile-view', view);
        }
        const group = btn.closest('.mobile-view-toggle');
        if (group) {
          group.querySelectorAll('.m-toggle-btn').forEach(b => b.classList.remove('active'));
        }
        btn.classList.add('active');
      });
    });

    // Mobile Sort Dropdowns
    const w9MobileSort = document.getElementById('week9-mobile-sort');
    if (w9MobileSort) {
      w9MobileSort.addEventListener('change', (e) => {
        const [col, dir] = e.target.value.split(':');
        sortStates.week9 = { column: col, ascending: dir === 'asc' };
        renderWeek9Projections();
      });
    }

    const w10MobileSort = document.getElementById('week10-mobile-sort');
    if (w10MobileSort) {
      w10MobileSort.addEventListener('change', (e) => {
        const [col, dir] = e.target.value.split(':');
        sortStates.week10 = { column: col, ascending: dir === 'asc' };
        renderWeek10Stashes();
      });
    }
  }

  function openModal(data) {
    const modal = document.getElementById('rationale-modal');
    if (!modal) return;

    const kpiRow = modal.querySelector('.modal-kpi-row');
    if (kpiRow) kpiRow.style.display = '';

    document.getElementById('modal-matchup-title').textContent = `${formatDstLabel(data.Target_DST)} vs ${data.Offense}`;
    document.getElementById('modal-tier-badge').textContent = data.Streamer_Tier;
    document.getElementById('modal-tier-badge').className = `badge tier-badge ${getTierClass(data.Streamer_Tier)}`;

    document.getElementById('modal-proj-pts').textContent = formatNum(data.Proj_Fantasy_Pts, 1);
    document.getElementById('modal-floor').textContent = formatNum(data.Predicted_Floor, 1);
    document.getElementById('modal-sacks').textContent = formatNum(data.Proj_Sacks, 1);
    document.getElementById('modal-ints').textContent = formatNum(data.Proj_INTs, 1);
    const fumblesEl = document.getElementById('modal-fumbles');
    if (fumblesEl) fumblesEl.textContent = formatNum(data.Proj_Fumbles, 1);
    document.getElementById('modal-implied').textContent = `${formatNum(data.Opp_Implied_Pts, 1)} pts`;

    document.getElementById('modal-qb').textContent = data.Starting_QB;
    const oppPtsEl = document.getElementById('modal-opp-pts-allowed');
    if (oppPtsEl) {
      oppPtsEl.textContent = (data.Last_4_Games !== undefined && data.Total_pts !== undefined) ? 
        `${data.Last_4_Games} pts (${(parseFloat(data.Last_4_Games) / 4).toFixed(1)}/g) • Szn: ${data.Total_pts} pts` : '—';
    }
    document.getElementById('modal-weather').textContent = data.Gametime_Weather;

    const dqiEl = document.getElementById('modal-dqi');
    if (dqiEl) dqiEl.textContent = (data.Def_DQI !== undefined && data.Def_DQI !== '-') ? formatNum(data.Def_DQI, 1) : '—';
    const defPressEl = document.getElementById('modal-def-press');
    if (defPressEl) defPressEl.textContent = (data['Def_Pressure_Rate%'] !== undefined && data['Def_Pressure_Rate%'] !== '-') ? `${formatNum(data['Def_Pressure_Rate%'], 1)}%` : '—';
    const defPassEpaEl = document.getElementById('modal-def-pass-epa');
    if (defPassEpaEl) defPassEpaEl.textContent = (data.Def_Pass_EPA !== undefined && data.Def_Pass_EPA !== '-') ? `${parseFloat(data.Def_Pass_EPA) > 0 ? '+' : ''}${formatNum(data.Def_Pass_EPA, 3)}` : '—';
    const def3rdEl = document.getElementById('modal-def-3rd-stop');
    if (def3rdEl) def3rdEl.textContent = (data['Def_3rd_Stop%'] !== undefined && data['Def_3rd_Stop%'] !== '-') ? `${formatNum(data['Def_3rd_Stop%'], 1)}%` : '—';
    const toEl = document.getElementById('modal-def-to-drive');
    if (toEl) toEl.textContent = (data['Def_Takeaway_Drive%'] !== undefined && data['Def_Takeaway_Drive%'] !== '-') ? `${formatNum(data['Def_Takeaway_Drive%'], 1)}%` : '—';
    const puntEl = document.getElementById('modal-def-punt-drive');
    if (puntEl) puntEl.textContent = (data['Def_Punt_Drive%'] !== undefined && data['Def_Punt_Drive%'] !== '-') ? `${formatNum(data['Def_Punt_Drive%'], 1)}%` : '—';
    const rzEl = document.getElementById('modal-def-rz-td');
    if (rzEl) rzEl.textContent = (data['Def_RZ_TD_Allowed%'] !== undefined && data['Def_RZ_TD_Allowed%'] !== '-') ? `${formatNum(data['Def_RZ_TD_Allowed%'], 1)}%` : '—';
    const defInjEl = document.getElementById('modal-def-injuries');
    if (defInjEl) defInjEl.textContent = data.Def_Injuries || 'Healthy';

    document.getElementById('modal-sp').textContent = `${formatNum(data['Sacks_Per_Press%'], 1)}%`;
    const qbFumbEl = document.getElementById('modal-qb-fumble');
    if (qbFumbEl) qbFumbEl.textContent = (data['QB_Fumble_Rate%'] !== undefined && data['QB_Fumble_Rate%'] !== '-') ? `${formatNum(data['QB_Fumble_Rate%'], 1)}% (${data.QB_Fumbles || 0} fumbles)` : '—';
    document.getElementById('modal-epa').textContent = `${parseFloat(data.Off_Pass_EPA_L4) > 0 ? '+' : ''}${formatNum(data.Off_Pass_EPA_L4, 3)}`;

    document.getElementById('modal-rationale-text').textContent = data.Current_Week_Rationale || 'Matchup analysis pending.';

    modal.showModal();
  }

  function openStashModal(data) {
    const modal = document.getElementById('rationale-modal');
    if (!modal) return;

    const kpiRow = modal.querySelector('.modal-kpi-row');
    if (kpiRow) kpiRow.style.display = 'none';

    document.getElementById('modal-matchup-title').textContent = `Week 10 Stash: ${data.Stash_DST} vs ${data.W10_Opponent}`;
    document.getElementById('modal-tier-badge').textContent = data.Stash_Tier || 'Neutral';
    document.getElementById('modal-tier-badge').className = `badge tier-badge ${getTierClass(data.Stash_Tier)}`;

    document.getElementById('modal-qb').textContent = data.Opp_QB || '—';
    const oppPtsEl = document.getElementById('modal-opp-pts-allowed');
    if (oppPtsEl) {
      oppPtsEl.textContent = `${data.Opp_Last_4} pts (${(data.Opp_Last_4 / 4).toFixed(1)}/g) • Szn: ${data.Opp_Total_Pts} pts`;
    }
    document.getElementById('modal-weather').textContent = 'Look-Ahead Matchup (Weather Pending)';

    const dqiEl = document.getElementById('modal-dqi');
    if (dqiEl) dqiEl.textContent = (data.Stash_DQI !== undefined && data.Stash_DQI !== '-') ? formatNum(data.Stash_DQI, 1) : '—';
    const defPressEl = document.getElementById('modal-def-press');
    if (defPressEl) defPressEl.textContent = (data['Def_Pressure_Rate%'] !== undefined && data['Def_Pressure_Rate%'] !== '-') ? `${formatNum(data['Def_Pressure_Rate%'], 1)}%` : '—';
    const defPassEpaEl = document.getElementById('modal-def-pass-epa');
    if (defPassEpaEl) defPassEpaEl.textContent = (data.Def_Pass_EPA !== undefined && data.Def_Pass_EPA !== '-') ? `${parseFloat(data.Def_Pass_EPA) > 0 ? '+' : ''}${formatNum(data.Def_Pass_EPA, 3)}` : '—';
    const def3rdEl = document.getElementById('modal-def-3rd-stop');
    if (def3rdEl) def3rdEl.textContent = (data['Def_3rd_Stop%'] !== undefined && data['Def_3rd_Stop%'] !== '-') ? `${formatNum(data['Def_3rd_Stop%'], 1)}%` : '—';
    const toEl = document.getElementById('modal-def-to-drive');
    if (toEl) toEl.textContent = (data['Def_Takeaway_Drive%'] !== undefined && data['Def_Takeaway_Drive%'] !== '-') ? `${formatNum(data['Def_Takeaway_Drive%'], 1)}%` : '—';
    const puntEl = document.getElementById('modal-def-punt-drive');
    if (puntEl) puntEl.textContent = '—';
    const rzEl = document.getElementById('modal-def-rz-td');
    if (rzEl) rzEl.textContent = (data['Def_RZ_TD_Allowed%'] !== undefined && data['Def_RZ_TD_Allowed%'] !== '-') ? `${formatNum(data['Def_RZ_TD_Allowed%'], 1)}%` : '—';
    const defInjEl = document.getElementById('modal-def-injuries');
    if (defInjEl) defInjEl.textContent = 'See Week 9 Tab';

    document.getElementById('modal-sp').textContent = '—';
    const qbFumbEl = document.getElementById('modal-qb-fumble');
    if (qbFumbEl) qbFumbEl.textContent = '—';
    document.getElementById('modal-epa').textContent = '—';

    document.getElementById('modal-rationale-text').textContent = data.Look_Ahead_Rationale || 'Look-ahead analysis pending.';

    modal.showModal();
  }

  function getTierClass(tierStr) {
    if (!tierStr) return 'stash-neutral';
    if (tierStr.includes('Priority')) return 'stash-priority';
    if (tierStr.includes('Speculative')) return 'stash-speculative';
    if (tierStr.includes('Neutral')) return 'stash-neutral';
    if (tierStr.includes('Avoid') || tierStr.includes('Do Not')) return 'stash-avoid';
    return 'stash-neutral';
  }

  function getDqiClass(dqi) {
    const val = parseFloat(dqi);
    if (isNaN(val)) return 'dqi-avg';
    if (val >= 90) return 'dqi-elite';
    if (val >= 80) return 'dqi-strong';
    if (val >= 70) return 'dqi-avg';
    return 'dqi-low';
  }

  // 11. Dark / Light Theme Toggle
  function initThemeToggle() {
    const toggleBtn = document.getElementById('theme-toggle-btn');
    const themeIcon = document.getElementById('theme-icon');
    const themeLabel = document.getElementById('theme-label');
    if (!toggleBtn) return;

    function getPreferredTheme() {
      const saved = localStorage.getItem('waffle-theme');
      if (saved) return saved;
      return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    }

    function applyTheme(theme) {
      if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        if (themeIcon) themeIcon.textContent = '🌙';
        if (themeLabel) themeLabel.textContent = 'Dark Mode';
        toggleBtn.setAttribute('aria-label', 'Switch to dark theme');
        toggleBtn.title = 'Switch to Dark Mode';
      } else {
        document.documentElement.removeAttribute('data-theme');
        if (themeIcon) themeIcon.textContent = '☀️';
        if (themeLabel) themeLabel.textContent = 'Light Mode';
        toggleBtn.setAttribute('aria-label', 'Switch to light theme');
        toggleBtn.title = 'Switch to Light Mode';
      }
    }

    // Set initial toggle button text/icon matching actual theme in documentElement
    const initialTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : getPreferredTheme();
    applyTheme(initialTheme);

    toggleBtn.addEventListener('click', () => {
      const isCurrentlyLight = document.documentElement.getAttribute('data-theme') === 'light';
      const nextTheme = isCurrentlyLight ? 'dark' : 'light';
      localStorage.setItem('waffle-theme', nextTheme);
      applyTheme(nextTheme);
    });

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
        if (!localStorage.getItem('waffle-theme')) {
          applyTheme(e.matches ? 'light' : 'dark');
        }
      });
    }
  }

  // 12. Visitor Counter Logic (Offline LocalStorage + Online Cloud CounterAPI)
  function initVisitorCounter() {
    const counterEl = document.getElementById('visitor-count');
    if (!counterEl) return;

    // Local storage visit counter (works offline and on file:// protocol in Safari)
    let currentVisits = parseInt(localStorage.getItem('waffle_streamer_visits') || '0', 10);
    currentVisits += 1;
    localStorage.setItem('waffle_streamer_visits', currentVisits);
    counterEl.textContent = currentVisits.toLocaleString();

    // When deployed online on GitHub Pages (http/https), connect to live shared visitor counter
    if (window.location.protocol.startsWith('http')) {
      fetch('https://api.counterapi.dev/v1/waffle-fantasy-dst-streamer-2026/visits/up')
        .then(res => res.json())
        .then(data => {
          if (data && typeof data.count === 'number') {
            counterEl.textContent = data.count.toLocaleString();
          }
        })
        .catch(err => {
          console.log('Remote counter unavailable, using local visit count:', err);
        });
    }
  }
});
