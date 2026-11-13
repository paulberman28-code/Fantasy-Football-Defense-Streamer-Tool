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
    playoffs: { column: 'Avg Opp Pts Allowed', ascending: false },
    history: { column: 'Total Points Allowed (W1-8)', ascending: false },
    'def-history': { column: 'Total Points (W1-8)', ascending: false },
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
    const headerKpis = document.querySelector('.app-header .kpi-grid');
    if (headerKpis) {
      headerKpis.style.display = (activeTab === 'audit' || activeTab === 'rules') ? 'none' : '';
    }
    setupHeaderMeta();
    setupNavigation();
    setupFilterEvents();
    setupSortingEvents();
    setupModalEvents();
    setupCopyCheatSheet();
    setupCompareModal();

    // Initial render
    renderAll();
  }

  // Official NFL Team Logos & Identity Helpers (ESPN CDN)
  function getTeamLogoUrl(code) {
    if (!code) return '';
    const clean = String(code).trim().toUpperCase();
    const espnMap = {
      'WAS': 'wsh',
      'WSH': 'wsh',
      'LAR': 'lar',
      'LA': 'lar',
      'LAC': 'lac'
    };
    const espnCode = espnMap[clean] || clean.toLowerCase();
    return `https://a.espncdn.com/i/teamlogos/nfl/500/${espnCode}.png`;
  }

  function renderTeamLogoHtml(code, label = '', size = 'sm') {
    if (!code || code === 'BYE') return '';
    const url = getTeamLogoUrl(code);
    const sizeClass = size === 'lg' ? 'team-logo team-logo-lg' : 'team-logo';
    return `<img class="${sizeClass}" src="${url}" alt="${label || code} logo" loading="lazy" onerror="this.style.display='none'">`;
  }

  function extractTeamCode(str) {
    if (!str) return '';
    const s = String(str).trim();
    const paren = s.match(/\(([A-Z]{2,3})\)/);
    if (paren) return paren[1];
    const start = s.match(/^[A-Z]{2,3}\b/);
    if (start && start[0] !== 'BYE') return start[0];
    const opp = s.match(/[@vs]\s*([A-Z]{2,3})/i);
    if (opp) return opp[1].toUpperCase();
    const nameToCode = {
      'Cardinals': 'ARI', 'Falcons': 'ATL', 'Ravens': 'BAL', 'Bills': 'BUF', 'Panthers': 'CAR',
      'Bears': 'CHI', 'Bengals': 'CIN', 'Browns': 'CLE', 'Cowboys': 'DAL', 'Broncos': 'DEN',
      'Lions': 'DET', 'Packers': 'GB', 'Texans': 'HOU', 'Colts': 'IND', 'Jaguars': 'JAX',
      'Chiefs': 'KC', 'Raiders': 'LV', 'Chargers': 'LAC', 'Rams': 'LAR', 'Dolphins': 'MIA',
      'Vikings': 'MIN', 'Patriots': 'NE', 'Saints': 'NO', 'Giants': 'NYG', 'Jets': 'NYJ',
      'Eagles': 'PHI', 'Steelers': 'PIT', '49ers': 'SF', 'Seahawks': 'SEA', 'Buccaneers': 'TB',
      'Titans': 'TEN', 'Commanders': 'WAS'
    };
    for (const [name, code] of Object.entries(nameToCode)) {
      if (s.includes(name)) return code;
    }
    return '';
  }

  // 3-Week Multi-Week Stream-Ahead Runway Cell Helper
  function renderRunwayCell(runway, grade) {
    if (!runway || !Array.isArray(runway) || runway.length === 0) {
      return `<span class="stat-dim">—</span>`;
    }
    const cleanGrade = (grade || 'C').replace('+', '-plus');
    const gradeBadge = `<span class="runway-grade-badge grade-${cleanGrade}">${grade || 'C'}</span>`;
    const chips = runway.map(m => {
      const chipClass = `chip-${m.diff || 'neutral'}`;
      const ppgText = m.diff === 'bye' ? 'BYE' : `${m.opp_ppg != null ? m.opp_ppg : '—'} PPG allowed`;
      const title = `Week ${m.week}: ${m.matchup} (${m.diff}) • ${ppgText}`;
      return `<span class="runway-chip ${chipClass}" title="${title}">${m.matchup || 'BYE'}</span>`;
    }).join('');
    return `<div class="runway-wrapper">${gradeBadge}<div class="runway-chips">${chips}</div></div>`;
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
          const smashCode = topSmash.Target_DST.split(' ')[0];
          document.getElementById('kpi-smash-name').innerHTML = `${renderTeamLogoHtml(smashCode, smashCode, 'lg')} <span>${formatDstLabel(topSmash.Target_DST)}</span>`;
          document.getElementById('kpi-smash-sub').textContent = `${formatNum(topSmash.Proj_Fantasy_Pts, 1)} Proj Pts • vs ${topSmash.Team}`;
        }

        // Top Floor Play
        const topFloor = [...active].sort((a, b) => (parseFloat(b.Predicted_Floor) || 0) - (parseFloat(a.Predicted_Floor) || 0))[0];
        if (topFloor) {
          const floorCode = topFloor.Target_DST.split(' ')[0];
          document.getElementById('kpi-floor-name').innerHTML = `${renderTeamLogoHtml(floorCode, floorCode, 'lg')} <span>${formatDstLabel(topFloor.Target_DST)}</span>`;
          document.getElementById('kpi-floor-sub').textContent = `${formatNum(topFloor.Predicted_Floor, 1)} Floor • ${formatNum(topFloor.Proj_Sacks, 1)} Sacks`;
        }

        // Weather Alert
        const windy = active.filter(m => (m.Gametime_Weather || '').toLowerCase().includes('wind') || (m.Gametime_Weather || '').toLowerCase().includes('gust') || (m.Gametime_Weather || '').toLowerCase().includes('breezy'));
        if (windy.length > 0) {
          const teamCodes = windy.map(w => w.Target_DST.split(' ')[0]);
          if (teamCodes.length > 4) {
            document.getElementById('kpi-weather-name').textContent = `${teamCodes.length} Games Impacted`;
            document.getElementById('kpi-weather-sub').textContent = `High Winds: ${teamCodes.slice(0, 4).join(', ')} +${teamCodes.length - 4} more`;
          } else {
            document.getElementById('kpi-weather-name').textContent = teamCodes.join(' & ');
            document.getElementById('kpi-weather-sub').textContent = `High Wind Gusts (INT Boost)`;
          }
        }
      }
    }

    if (appData.lookAheadStashes && appData.lookAheadStashes.length > 0) {
      const topStash = appData.lookAheadStashes[0];
      const stashCode = topStash.Stash_DST.split(' ')[0];
      const stashOpp = topStash.W11_Opponent || topStash.W10_Opponent || '';
      document.getElementById('kpi-stash-name').innerHTML = `${renderTeamLogoHtml(stashCode, stashCode, 'lg')} <span>${topStash.Stash_DST} (Week ${meta.lookAheadWeek})</span>`;
      document.getElementById('kpi-stash-sub').textContent = `${stashOpp} (${topStash.Opp_Last_4} pts L4)`;
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
          headerKpis.style.display = (target === 'audit' || target === 'rules') ? 'none' : '';
        }

        if (typeof gtag === 'function') {
          gtag('event', 'select_tab', { tab_name: target });
        }

        renderActiveTable();
      });
    });
  }

  // 4. Filter & Selector Event Listeners
  function setupFilterEvents() {
    const auditWeekSelect = document.getElementById('audit-week-select');
    if (auditWeekSelect) {
      auditWeekSelect.addEventListener('change', () => {
        renderAuditReport();
      });
    }
  }

  // 5. Sorting Event Listeners
  function setupSortingEvents() {
    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const table = th.closest('table');
        const column = th.dataset.sort;

        if (table && table.id === 'playoffs-table') {
          if (!sortStates.playoffs) sortStates.playoffs = { column: 'Avg Opp Pts Allowed', ascending: false };
          const currentSort = sortStates.playoffs;
          if (currentSort.column === column) {
            currentSort.ascending = !currentSort.ascending;
          } else {
            currentSort.column = column;
            currentSort.ascending = false;
          }
          updateSortHeaders(table, column, currentSort.ascending);
          renderPlayoffRadar();
          return;
        }

        const currentSort = sortStates[activeTab];
        if (!currentSort) return;

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
    renderPlayoffRadar();
    renderHistory();
    renderDefenseHistory();
    renderPointsAnatomy();
    renderAuditReport();
  }

  function renderActiveTable() {
    if (activeTab === 'week9') renderWeek9Projections();
    else if (activeTab === 'week10') {
      renderWeek10Stashes();
      renderPlayoffRadar();
    }
    else if (activeTab === 'history') renderHistory();
    else if (activeTab === 'def-history') renderDefenseHistory();
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
      'Week 10 Verdict': 'Streamer_Tier',
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
      '3-Week Runway Grade': 'Runway_Avg_Pts',
      '3-Week Runway': 'Runway_Avg_Pts',
      'Runway (W9-W11)': 'Runway_Avg_Pts',
      '3-Week Runway (W9–W11)': 'Runway_Avg_Pts',
      'Runway (W10-W12)': 'Runway_Avg_Pts',
      '3-Week Runway (W10–W12)': 'Runway_Avg_Pts',
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
      const teamCode = r.Target_DST.split(' ')[0];
      const oppCode = extractTeamCode(r.Offense);
      
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
            <div class="team-cell">
              ${renderTeamLogoHtml(teamCode, r.Target_DST)}
              <span class="stat-bold">${formatDstLabel(r.Target_DST)}</span>
            </div>
          </td>
          <td>
            <div class="team-cell">
              ${renderTeamLogoHtml(oppCode, r.Offense)}
              <span>${r.Offense}</span>
            </div>
          </td>
          <td>${qbDisplay}</td>
          <td class="col-center"><span class="badge ${tierClass}">${r.Streamer_Tier}</span></td>
          <td class="col-center"><span class="pts-highlight ${parseFloat(r.Last_4_Games) >= 30 ? 'pts-top' : ''}">${r.Last_4_Games} pts</span> <span class="stat-dim">(${(parseFloat(r.Last_4_Games) / 4).toFixed(1)}/g)</span></td>
          <td class="col-center"><span class="stat-bold">${r.Total_pts} pts</span></td>
          <td class="col-center">${renderRunwayCell(r.Runway_W10_W12 || r.Runway_W9_W11, r.Runway_Grade)}</td>
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
        const teamCode = r.Target_DST.split(' ')[0];
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
                <div class="team-cell">
                  ${renderTeamLogoHtml(teamCode, r.Target_DST)}
                  <span class="m-card-team">${formatDstLabel(r.Target_DST)} <small style="font-weight:500; opacity:0.85;">vs ${r.Offense}</small></span>
                </div>
                <div style="display:flex; align-items:center; gap:0.4rem; margin-top:0.25rem;">
                  ${renderRunwayCell(r.Runway_W10_W12 || r.Runway_W9_W11, r.Runway_Grade)}
                  <span class="badge ${tierClass}">${r.Streamer_Tier}</span>
                </div>
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
      'Week 11 Opponent': 'W11_Opponent',
      'Week 10 Verdict': 'Tier_Rank',
      'Week 11 Verdict': 'Tier_Rank',
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
      const rawOpp = s.W11_Opponent || s.W10_Opponent || '';
      const mobileOpp = s.W11_Opponent_Mobile || s.W10_Opponent_Mobile || rawOpp;
      const stashCode = s.Stash_DST;
      const oppCode = extractTeamCode(rawOpp);

      return `
        <tr data-stash-idx="${idx}" class="stash-row">
          <td class="col-sticky">
            <div class="team-cell">
              ${renderTeamLogoHtml(stashCode, s.Stash_DST)}
              <span class="stat-bold">${s.Stash_DST}</span>
            </div>
          </td>
          <td>
            <div class="team-cell">
              ${renderTeamLogoHtml(oppCode, rawOpp)}
              <span class="team-desktop">${rawOpp}</span><span class="team-mobile stat-bold">${mobileOpp}</span>
            </div>
          </td>
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

    // Render Mobile Card View for Look-Ahead Stashes
    const w10CardsContainer = document.getElementById('week10-cards-container');
    if (w10CardsContainer) {
      w10CardsContainer.innerHTML = rows.map((s, idx) => {
        const tierBadgeClass = getTierClass(s.Stash_Tier);
        const rawOpp = s.W11_Opponent || s.W10_Opponent || '';
        const mobileOpp = s.W11_Opponent_Mobile || s.W10_Opponent_Mobile || rawOpp;
        const matchupLabel = mobileOpp.startsWith('@') ? `(${mobileOpp})` : `vs ${mobileOpp}`;
        const stashCode = s.Stash_DST;

        return `
          <article class="mobile-matchup-card stash-mobile-card" data-stash-idx="${idx}">
            <div class="m-card-header">
              <div class="m-card-title-group">
                <div class="team-cell">
                  ${renderTeamLogoHtml(stashCode, s.Stash_DST)}
                  <span class="m-card-team">${s.Stash_DST} <small style="font-weight:500; opacity:0.85;">${matchupLabel}</small></span>
                </div>
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

    // Synchronously render the Playoff Schedule Radar
    renderPlayoffRadar();
  }

  // 8b. Render Fantasy Playoff Schedule Radar (Weeks 15–17)
  function renderPlayoffRadar() {
    const tbody = document.getElementById('playoffs-tbody');
    if (!tbody || !appData || !appData.playoffRadar) return;

    let rows = [...appData.playoffRadar];
    const sortConfig = sortStates.playoffs || { column: 'Avg Opp Pts Allowed', ascending: false };

    const keyMap = {
      'Defense': 'Defense',
      'Playoff Rating': 'Playoff_Rating',
      'Avg Opp Pts Allowed': 'Playoff_Avg_Opp_Allowed',
      'Week 15 Matchup': 'W15_Opp_Pts',
      'Week 16 Matchup': 'W16_Opp_Pts',
      'Week 17 Matchup': 'W17_Opp_Pts'
    };

    const targetKey = keyMap[sortConfig.column] || sortConfig.column;
    rows = sortData(rows, targetKey, sortConfig.ascending);

    function getPlayoffBadgeClass(rating) {
      if (!rating) return 'badge-neutral';
      if (rating.includes('Elite')) return 'badge-priority';
      if (rating.includes('Favorable')) return 'badge-speculative';
      if (rating.includes('Moderate')) return 'badge-neutral';
      return 'badge-avoid';
    }

    function renderMatchupChip(matchup, opp, pts, diff) {
      const chipClass = `chip-${diff || 'neutral'}`;
      const title = `${opp} allows ${pts} PPG to fantasy D/ST`;
      return `
        <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
          <span class="runway-chip ${chipClass}" title="${title}">${matchup}</span>
          <span class="stat-dim" style="font-size:0.75rem;">${pts} pts/g</span>
        </div>
      `;
    }

    tbody.innerHTML = rows.map(r => {
      const badgeClass = getPlayoffBadgeClass(r.Playoff_Rating);
      const teamCode = r.Team || extractTeamCode(r.Defense);

      return `
        <tr>
          <td class="col-sticky">
            <div class="team-cell">
              ${renderTeamLogoHtml(teamCode, r.Defense)}
              <span class="stat-bold">${r.Defense}</span>
            </div>
          </td>
          <td class="col-center"><span class="badge ${badgeClass}">${r.Playoff_Rating}</span></td>
          <td class="col-center"><span class="pts-highlight ${r.Playoff_Avg_Opp_Allowed >= 5.5 ? 'pts-top' : ''}">${formatNum(r.Playoff_Avg_Opp_Allowed, 2)} pts</span></td>
          <td class="col-center">${renderMatchupChip(r.W15_Matchup, r.W15_Opp, r.W15_Opp_Pts, r.W15_Diff)}</td>
          <td class="col-center">${renderMatchupChip(r.W16_Matchup, r.W16_Opp, r.W16_Opp_Pts, r.W16_Diff)}</td>
          <td class="col-center">${renderMatchupChip(r.W17_Matchup, r.W17_Opp, r.W17_Opp_Pts, r.W17_Diff)}</td>
          <td class="col-rationale" style="font-size:0.84rem; line-height:1.45;">${r.Playoff_Outlook}</td>
        </tr>
      `;
    }).join('');

    // Render Mobile Card View for Playoff Schedule Radar
    const cardsContainer = document.getElementById('playoffs-cards-container');
    if (cardsContainer) {
      cardsContainer.innerHTML = rows.map(r => {
        const badgeClass = getPlayoffBadgeClass(r.Playoff_Rating);
        const teamCode = r.Team || extractTeamCode(r.Defense);

        return `
          <article class="mobile-matchup-card playoff-mobile-card">
            <div class="m-card-header">
              <div class="m-card-title-group">
                <div class="team-cell">
                  ${renderTeamLogoHtml(teamCode, r.Defense)}
                  <span class="m-card-team">${r.Defense}</span>
                </div>
                <span class="badge ${badgeClass}">${r.Playoff_Rating}</span>
              </div>
              <div class="m-card-pts-box">
                <span class="m-card-pts ${r.Playoff_Avg_Opp_Allowed >= 5.5 ? 'pts-top' : ''}">${formatNum(r.Playoff_Avg_Opp_Allowed, 2)} <small>PTS/G</small></span>
                <span class="m-card-floor">Playoff Avg</span>
              </div>
            </div>
            <div class="playoff-card-schedule-grid">
              <div class="playoff-round-col">
                <div class="playoff-round-lbl">W15 Qtrs</div>
                <span class="runway-chip chip-${r.W15_Diff || 'neutral'}" title="${r.W15_Opp} allows ${r.W15_Opp_Pts} PPG">${r.W15_Matchup}</span>
                <div class="playoff-round-sub">${formatNum(r.W15_Opp_Pts, 1)}/g</div>
              </div>
              <div class="playoff-round-col">
                <div class="playoff-round-lbl">W16 Semis</div>
                <span class="runway-chip chip-${r.W16_Diff || 'neutral'}" title="${r.W16_Opp} allows ${r.W16_Opp_Pts} PPG">${r.W16_Matchup}</span>
                <div class="playoff-round-sub">${formatNum(r.W16_Opp_Pts, 1)}/g</div>
              </div>
              <div class="playoff-round-col">
                <div class="playoff-round-lbl">W17 Finals</div>
                <span class="runway-chip chip-${r.W17_Diff || 'neutral'}" title="${r.W17_Opp} allows ${r.W17_Opp_Pts} PPG">${r.W17_Matchup}</span>
                <div class="playoff-round-sub">${formatNum(r.W17_Opp_Pts, 1)}/g</div>
              </div>
            </div>
            <div class="m-card-footer" style="margin-top: 0.35rem; padding-top: 0.35rem; border-top: 1px solid var(--border-subtle);">
              <p class="m-card-snippet" style="font-size: 0.8rem; line-height: 1.4; color: var(--text-muted); -webkit-line-clamp: 3;">${r.Playoff_Outlook}</p>
            </div>
          </article>
        `;
      }).join('');
    }
  }

  function getStashBadgeClass(tier) {
    return getTierClass(tier);
  }

  // 9. Render Tab 3: Historical Offense Vulnerability (W1–W9)
  function renderHistory() {
    const tbody = document.getElementById('history-tbody');
    if (!tbody || !appData.historicalOffenses) return;

    let rows = [...appData.historicalOffenses];

    const sortConfig = sortStates.history;
    const keyMap = {
      'Offense': 'Offense',
      'Week 1': 'W1', 'Week 2': 'W2', 'Week 3': 'W3', 'Week 4': 'W4',
      'Week 5': 'W5', 'Week 6': 'W6', 'Week 7': 'W7', 'Week 8': 'W8', 'Week 9': 'W9',
      'Last 2 Games Played': 'Last_2_Games',
      'Last 4 Games Played': 'Last_4_Games',
      'Total Points Allowed (W1-8)': 'Total_pts',
      'Total Points Allowed (W1-9)': 'Total_pts',
      'Total Pts (W1–9)': 'Total_pts',
      'Total Pts (W1-9)': 'Total_pts',
      'Streaming Defense': 'Target_DST',
      'Week 9 Opponent': 'Target_DST',
      'Week 10 Opponent': 'Target_DST',
      'Quarterback & Status': 'Starting_QB',
      'Week 9 Verdict': 'Streamer_Tier',
      'Week 10 Verdict': 'Streamer_Tier',
      'Streaming Tier': 'Streamer_Tier'
    };
    const targetKey = keyMap[sortConfig.column] || sortConfig.column;
    rows = sortData(rows, targetKey, sortConfig.ascending);

    tbody.innerHTML = rows.map(h => {
      const isBackup = h.Starting_QB && h.Starting_QB.includes('Yes');
      const tierClass = getTierClass(h.Streamer_Tier);

      return `
        <tr>
          <td class="col-sticky">
            <div class="team-cell">
              ${renderTeamLogoHtml(extractTeamCode(h.Offense), h.Offense)}
              <span class="stat-bold team-desktop">${h.Offense}</span><span class="stat-bold team-mobile">${h.Team || h.Offense}</span>
            </div>
          </td>
          ${renderHeatCell(h.W1)}
          ${renderHeatCell(h.W2)}
          ${renderHeatCell(h.W3)}
          ${renderHeatCell(h.W4)}
          ${renderHeatCell(h.W5)}
          ${renderHeatCell(h.W6)}
          ${renderHeatCell(h.W7)}
          ${renderHeatCell(h.W8)}
          ${renderHeatCell(h.W9)}
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

  // 9b. Render Tab: Historical Defense Performance & Momentum (W1–W9)
  function renderDefenseHistory() {
    const tbody = document.getElementById('def-history-tbody');
    if (!tbody || !appData.historicalDefenses) return;

    let rows = [...appData.historicalDefenses];

    const sortConfig = sortStates['def-history'] || { column: 'Total Points (W1-9)', ascending: false };
    const keyMap = {
      'Defense': 'Defense',
      'Week 1': 'W1', 'Week 2': 'W2', 'Week 3': 'W3', 'Week 4': 'W4',
      'Week 5': 'W5', 'Week 6': 'W6', 'Week 7': 'W7', 'Week 8': 'W8', 'Week 9': 'W9',
      'Last 2 Games Played': 'Last_2_Games',
      'Last 4 Games Played': 'Last_4_Games',
      'Total Points (W1-8)': 'Total_pts',
      'Total Points (W1-9)': 'Total_pts',
      'Total Points': 'Total_pts',
      'Total Pts (W1-8)': 'Total_pts',
      'Total Pts (W1-9)': 'Total_pts',
      'Total Pts (W1–9)': 'Total_pts',
      'Fantasy PPG': 'PPG',
      'PPG': 'PPG',
      'Trend Momentum': 'Trend_Delta',
      'Momentum Trend': 'Trend_Delta',
      'Def Quality Index (DQI)': 'Def_DQI',
      'Def Pressure %': 'Def_Pressure_Rate%',
      'Def Pass EPA': 'Def_Pass_EPA',
      'Total Sacks': 'Sacks',
      'Sacks': 'Sacks',
      'Total Takeaways': 'Takeaways',
      'Takeaways': 'Takeaways',
      'Week 9 Opponent': 'Week9_Opponent',
      'Week 9 Matchup': 'Week9_Opponent',
      'Week 9 Verdict': 'Week9_Verdict',
      'Week 10 Opponent': 'Week10_Opponent',
      'Week 10 Matchup': 'Week10_Opponent',
      'Week 10 Verdict': 'Week10_Verdict'
    };
    const targetKey = keyMap[sortConfig.column] || sortConfig.column;
    rows = sortData(rows, targetKey, sortConfig.ascending);

    tbody.innerHTML = rows.map(d => {
      const oppMatchup = d.Week10_Opponent || d.Week9_Opponent || 'BYE';
      const verdict = d.Week10_Verdict || d.Week9_Verdict || 'Neutral';
      const tierClass = getTierClass(verdict);
      let trendBadge = '';
      if (d.Trend_Delta >= 1.5) {
        trendBadge = `<span class="badge badge-priority" title="L4 PPG is +${d.Trend_Delta} above season average">▲ +${d.Trend_Delta} Surging</span>`;
      } else if (d.Trend_Delta <= -1.5) {
        trendBadge = `<span class="badge badge-avoid" title="L4 PPG is ${d.Trend_Delta} below season average">▼ ${d.Trend_Delta} Cooling</span>`;
      } else {
        trendBadge = `<span class="badge badge-neutral" title="L4 PPG is consistent with season average">➔ ${d.Trend_Delta > 0 ? '+' : ''}${d.Trend_Delta} Steady</span>`;
      }

      return `
        <tr>
          <td class="col-sticky">
            <div class="team-cell">
              ${renderTeamLogoHtml(extractTeamCode(d.Defense), d.Defense)}
              <span class="stat-bold team-desktop">${d.Defense}</span><span class="stat-bold team-mobile">${d.Team || d.Defense}</span>
            </div>
          </td>
          ${renderDefHeatCell(d.W1)}
          ${renderDefHeatCell(d.W2)}
          ${renderDefHeatCell(d.W3)}
          ${renderDefHeatCell(d.W4)}
          ${renderDefHeatCell(d.W5)}
          ${renderDefHeatCell(d.W6)}
          ${renderDefHeatCell(d.W7)}
          ${renderDefHeatCell(d.W8)}
          ${renderDefHeatCell(d.W9)}
          <td class="col-center"><span class="stat-bold ${d.Last_2_Games >= 18 ? 'pts-top' : ''}">${d.Last_2_Games}</span></td>
          <td class="col-center"><span class="stat-bold ${d.Last_4_Games >= 32 ? 'pts-top' : ''}">${d.Last_4_Games}</span> <span class="stat-dim">(${d.L4_PPG}/g)</span></td>
          <td class="col-center"><span class="pts-highlight ${d.Total_pts >= 50 ? 'pts-top' : ''}">${d.Total_pts}</span></td>
          <td class="col-center stat-bold">${formatNum(d.PPG, 1)}</td>
          <td class="col-center">${trendBadge}</td>
          <td class="col-center"><span class="dqi-badge ${getDqiClass(d.Def_DQI)}">${d.Def_DQI !== '-' ? formatNum(d.Def_DQI, 1) : '—'}</span></td>
          <td class="col-center ${parseFloat(d['Def_Pressure_Rate%']) >= 25 ? 'stat-bold pts-top' : ''}">${d['Def_Pressure_Rate%'] !== '-' ? formatNum(d['Def_Pressure_Rate%'], 1) + '%' : '—'}</td>
          <td class="col-center ${parseFloat(d.Def_Pass_EPA) < 0 ? 'pts-top stat-bold' : ''}">${d.Def_Pass_EPA !== '-' ? (parseFloat(d.Def_Pass_EPA) > 0 ? '+' : '') + formatNum(d.Def_Pass_EPA, 3) : '—'}</td>
          <td class="col-center stat-bold">${d.Sacks}</td>
          <td class="col-center stat-bold">${d.Takeaways}</td>
          <td>${oppMatchup}</td>
          <td class="col-center"><span class="badge ${tierClass}">${verdict}</span></td>
        </tr>
      `;
    }).join('');
  }

  function renderDefHeatCell(val) {
    if (val === 'BYE') return `<td class="stat-dim col-wk">BYE</td>`;
    const num = parseFloat(val);
    if (isNaN(num)) return `<td class="col-wk">${val}</td>`;

    // Standard Microsoft Excel Blue - White - Red conditional formatting scale (Flipped for Defense):
    // Blue for Boom Week (High points scored: 7 to 22+)
    // White for Neutral (Average points scored: 3 to 6)
    // Red for Quiet Week (Low points scored: 0 to 2)
    const mid = 4.5;
    const maxVal = 14.0;
    let bg, textColor;

    if (num <= mid) {
      // Interpolate from Rich Red (0 pts) to White (4.5 pts)
      const ratio = num / mid;
      const r = 255;
      const g = Math.round(38 + (255 - 38) * ratio);
      const b = Math.round(38 + (255 - 38) * ratio);
      bg = `rgb(${r}, ${g}, ${b})`;
      textColor = ratio < 0.45 ? '#ffffff' : '#0f172a';
    } else {
      // Interpolate from White (4.5 pts) to Rich Blue (14+ pts)
      const ratio = Math.min(1.0, (num - mid) / (maxVal - mid));
      const r = Math.round(255 - (255 - 37) * ratio);
      const g = Math.round(255 - (255 - 99) * ratio);
      const b = 255;
      bg = `rgb(${r}, ${g}, ${b})`;
      textColor = ratio > 0.55 ? '#ffffff' : '#0f172a';
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
          <td class="col-sticky">
            <div class="team-cell">
              ${renderTeamLogoHtml(r.Team, r.Team_Name || r.Team)}
              <span class="team-desktop"><span class="stat-bold">${r.Team_Name || r.Team}</span> <span class="stat-dim">(${r.Team})</span></span><span class="stat-bold team-mobile">${r.Team}</span>
            </div>
          </td>
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
      const isSnapAudited = completedAudits.some(a => a.week === activeSnap.week);
      if (statusEl) {
        statusEl.textContent = isSnapAudited ? `✅ Week ${activeSnap.week} Audited` : `⏳ Week ${activeSnap.week} Baseline Locked`;
        statusEl.className = `ledger-badge ${isSnapAudited ? 'badge-priority' : 'badge-speculative'}`;
      }
      const idEl = document.getElementById('audit-ledger-id');
      if (idEl) idEl.textContent = activeSnap.snapshot_id || `2026_week_${activeSnap.week}`;
      const timeEl = document.getElementById('audit-ledger-time');
      if (timeEl) timeEl.textContent = activeSnap.timestamp_local || 'Frozen Pre-Kickoff';
      const commitEl = document.getElementById('audit-ledger-commit');
      if (commitEl) commitEl.textContent = (activeSnap.git_commit_hash || '').slice(0, 10);
      const shaEl = document.getElementById('audit-ledger-sha');
      if (shaEl) shaEl.textContent = (activeSnap.sha256 || '').slice(0, 16) + '...';
      const countEl = document.getElementById('audit-ledger-count');
      if (countEl) countEl.textContent = `${activeSnap.records_count || 28} Active Defenses`;
    }

    // 2. Cumulative Season KPIs
    const maeEl = document.getElementById('audit-kpi-mae');
    const priorityEl = document.getElementById('audit-kpi-priority');
    const floorEl = document.getElementById('audit-kpi-floor');
    const matchupsEl = document.getElementById('audit-kpi-matchups');

    const activeWeekNum = (appData.meta && appData.meta.currentWeek) || 10;

    if (completedAudits.length > 0) {
      // Real mathematical aggregations across all completed audits
      const totalMatchups = completedAudits.reduce((acc, a) => acc + (a.summary.total_matchups || 0), 0);
      const weightedMae = (completedAudits.reduce((acc, a) => acc + (a.summary.mae * a.summary.total_matchups), 0) / (totalMatchups || 1)).toFixed(2);
      const avgPriorityHit = (completedAudits.reduce((acc, a) => acc + (a.summary.priority_hit_rate_pct || 0), 0) / completedAudits.length).toFixed(1);
      const avgFloorRel = (completedAudits.reduce((acc, a) => acc + (a.summary.floor_reliability_pct || 0), 0) / completedAudits.length).toFixed(1);

      if (maeEl) maeEl.textContent = `${weightedMae} pts`;
      if (priorityEl) priorityEl.textContent = `${avgPriorityHit}%`;
      if (floorEl) floorEl.textContent = `${avgFloorRel}%`;
      if (matchupsEl) matchupsEl.textContent = `${totalMatchups} (${completedAudits.length} wk${completedAudits.length > 1 ? 's' : ''})`;
    } else {
      // Pre-game zero-hardcoding state: strictly grounded in live status
      if (maeEl) maeEl.textContent = 'Pending';
      if (priorityEl) priorityEl.textContent = 'Pending';
      if (floorEl) floorEl.textContent = 'Pending';
      if (matchupsEl) matchupsEl.textContent = `0 Audited (W${activeWeekNum} Locked)`;
    }

    // 3. Weekly Report Cards Summary Table
    const summaryTbody = document.getElementById('audit-summary-tbody');
    if (summaryTbody) {
      let summaryRowsHtml = '';

      // Completed weeks from audits/
      completedAudits.forEach(aud => {
        const gradeStr = aud.summary.grade || aud.summary.weekly_letter_grade || 'C (Average)';
        const gradeClass = gradeStr.startsWith('A') ? 'badge-priority' : (gradeStr.startsWith('B') ? 'badge-speculative' : (gradeStr.startsWith('C') ? 'badge-neutral' : 'badge-avoid'));
        const priorityRecs = (aud.matchup_reconciliation || []).filter(m => m.tier === 'Priority');
        const priorityTeams = aud.summary.priority_teams || (priorityRecs.length > 0 ? priorityRecs.map(m => m.dst).join(', ') : '—');
        const priorityAvgProj = aud.summary.priority_avg_proj !== undefined ? aud.summary.priority_avg_proj : 
          (priorityRecs.length > 0 ? (priorityRecs.reduce((a, b) => a + (parseFloat(b.proj_pts) || 0), 0) / priorityRecs.length) : null);
        const priorityAvgActual = aud.summary.priority_avg_actual !== undefined ? aud.summary.priority_avg_actual :
          (priorityRecs.length > 0 ? (priorityRecs.reduce((a, b) => a + (parseFloat(b.actual_pts) || 0), 0) / priorityRecs.length) : null);
        const priorityProjActualText = priorityAvgProj !== null ? `${formatNum(priorityAvgProj, 1)} / ${formatNum(priorityAvgActual, 1)} pts` : '—';

        summaryRowsHtml += `
          <tr>
            <td class="stat-bold">Week ${aud.week}</td>
            <td><span class="badge badge-priority">✅ Finalized</span></td>
            <td>${priorityTeams}</td>
            <td class="col-center stat-bold">${priorityProjActualText}</td>
            <td class="col-center"><span class="pts-highlight">${formatNum(aud.summary.priority_hit_rate_pct, 1)}%</span></td>
            <td class="col-center stat-bold">${formatNum(aud.summary.mae, 2)} pts</td>
            <td class="col-center">${formatNum(aud.summary.floor_reliability_pct, 1)}%</td>
            <td class="col-center"><span class="badge ${gradeClass}">${gradeStr}</span></td>
          </tr>
        `;
      });

      // Current In-Progress / Locked Week
      const activeWeek = (appData.meta && appData.meta.currentWeek) || 10;
      const isCurrentAudited = completedAudits.some(a => a.week === activeWeek);

      if (!isCurrentAudited && appData.weekMatchups) {
        const activeMatchups = appData.weekMatchups.filter(m => m.Target_DST && !m.Target_DST.includes('BYE'));
        const priorityList = activeMatchups.filter(m => m.Streamer_Tier === 'Priority');
        const priorityNames = priorityList.map(m => m.Target_DST.split(' ')[0]).join(', ');
        const avgPriorityProj = priorityList.length > 0 ? (priorityList.reduce((acc, m) => acc + (parseFloat(m.Proj_Fantasy_Pts) || 0), 0) / priorityList.length).toFixed(1) : '—';

        summaryRowsHtml += `
          <tr>
            <td class="stat-bold">Week ${activeWeek}</td>
            <td><span class="badge badge-speculative">⏳ Baseline Locked (Pending)</span></td>
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
    if (matchupsTbody) {
      // Determine which week to display in granular reconciliation table
      const weekSelectEl = document.getElementById('audit-week-select');
      let targetAuditWeek = 9;
      if (weekSelectEl) {
        targetAuditWeek = parseInt(weekSelectEl.value, 10) || 9;
      } else if (completedAudits.length > 0) {
        targetAuditWeek = completedAudits[completedAudits.length - 1].week;
      } else {
        targetAuditWeek = activeWeekNum;
      }

      const weekAudit = completedAudits.find(a => a.week === targetAuditWeek);
      let enrichedRows = [];

      if (weekAudit && weekAudit.matchup_reconciliation) {
        // Render completed official audited week outcomes
        enrichedRows = weekAudit.matchup_reconciliation.map(m => {
          return {
            Target_DST: m.dst,
            Offense: m.opp,
            Streamer_Tier: m.tier,
            _auditMatch: m,
            _projPts: parseFloat(m.proj_pts) || 0,
            _actualPts: m.actual_pts,
            _projError: m.error_diff,
            _floor: parseFloat(m.floor) || 0,
            _floorMet: m.floor_met ? 1 : 0,
            _projSacks: parseFloat(m.proj_sacks) || 0,
            _actualSacks: m.actual_sacks,
            _projTO: parseFloat(m.proj_to) || 0,
            _actualTO: m.actual_to,
            _projBracket: parseFloat(m.proj_bracket) || 0,
            _actualBracket: m.actual_bracket,
            _projOther: parseFloat(m.proj_other) || 0,
            _actualOther: parseFloat(m.actual_other !== undefined ? m.actual_other : 0),
            _outcome: m.hit ? 'HIT' : 'MISS',
            _isAudited: true
          };
        });
      } else if (appData.weekMatchups) {
        // Render pre-game locked baseline for active/pending week
        const activeMatchups = appData.weekMatchups.filter(m => m.Target_DST && !m.Target_DST.includes('BYE'));
        enrichedRows = activeMatchups.map(r => {
          const totalProj = parseFloat(r.Proj_Fantasy_Pts) || 0;
          const projSacks = parseFloat(r.Proj_Sacks) || 0;
          const projTO = parseFloat(r.Proj_INTs || 0) + parseFloat(r.Proj_Fumbles || 0);
          const projBracket = parseFloat(r.Exp_Bracket) || 0;
          const projOther = Math.max(0, parseFloat((totalProj - (projSacks + projTO + projBracket)).toFixed(1)));

          return {
            ...r,
            _auditMatch: null,
            _projPts: totalProj,
            _actualPts: null,
            _projError: null,
            _floor: parseFloat(r.Predicted_Floor) || 0,
            _floorMet: null,
            _projSacks: projSacks,
            _actualSacks: null,
            _projTO: projTO,
            _actualTO: null,
            _projBracket: projBracket,
            _actualBracket: null,
            _projOther: projOther,
            _actualOther: null,
            _outcome: 'Pending',
            _isAudited: false
          };
        });
      }

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
        const defCode = r.Target_DST.split(' ')[0];
        const oppCode = extractTeamCode(r.Offense);

        if (match) {
          const errorSign = match.error_diff > 0 ? '+' : '';
          const errorClass = Math.abs(match.error_diff) <= 2.5 ? 'pts-top' : (Math.abs(match.error_diff) >= 5.0 ? 'stat-dim' : '');
          return `
            <tr>
              <td class="col-sticky">
                <div class="team-cell">
                  ${renderTeamLogoHtml(defCode, r.Target_DST)}
                  <span class="stat-bold">${formatDstLabel(r.Target_DST)}</span>
                </div>
              </td>
              <td>
                <div class="team-cell">
                  ${renderTeamLogoHtml(oppCode, r.Offense)}
                  <span>${r.Offense}</span>
                </div>
              </td>
              <td class="col-center"><span class="badge ${tierClass}">${r.Streamer_Tier}</span></td>
              <td class="col-center stat-bold">${formatNum(match.proj_pts, 1)}</td>
              <td class="col-center pts-highlight">${formatNum(match.actual_pts, 1)}</td>
              <td class="col-center stat-bold ${errorClass}">${errorSign}${formatNum(match.error_diff, 1)}</td>
              <td class="col-center stat-dim">${formatNum(match.floor, 1)}</td>
              <td class="col-center">${match.floor_met ? '✅ Yes' : '❌ No'}</td>
              <td class="col-center">${formatNum(match.proj_sacks, 1)} / ${match.actual_sacks}</td>
              <td class="col-center">${formatNum(match.proj_to, 1)} / ${match.actual_to}</td>
              <td class="col-center">${formatNum(match.proj_bracket, 1)} / ${match.actual_bracket}</td>
              <td class="col-center">${formatNum(r._projOther, 1)} / ${formatNum(match.actual_other !== undefined ? match.actual_other : 0, 1)}</td>
              <td class="col-center"><span class="badge ${match.hit ? 'badge-priority' : 'badge-avoid'}">${match.hit ? 'HIT' : 'MISS'}</span></td>
            </tr>
          `;
        }

        // Pre-game active view: strictly truth-grounded in locked snapshot
        const toProj = (parseFloat(r.Proj_INTs || 0) + parseFloat(r.Proj_Fumbles || 0)).toFixed(1);
        return `
          <tr>
            <td class="col-sticky">
              <div class="team-cell">
                ${renderTeamLogoHtml(defCode, r.Target_DST)}
                <span class="stat-bold">${formatDstLabel(r.Target_DST)}</span>
              </div>
            </td>
            <td>
              <div class="team-cell">
                ${renderTeamLogoHtml(oppCode, r.Offense)}
                <span>${r.Offense}</span>
              </div>
            </td>
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

    document.getElementById('modal-matchup-title').innerHTML = `<div class="team-cell" style="display:inline-flex;">${renderTeamLogoHtml(data.Target_DST.split(' ')[0], data.Target_DST, 'lg')} <span>${formatDstLabel(data.Target_DST)} vs ${data.Offense}</span></div>`;
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

    if (typeof gtag === 'function') {
      gtag('event', 'view_scouting_report', { defense: data.Target_DST });
    }

    modal.showModal();
  }

  function openStashModal(data) {
    const modal = document.getElementById('rationale-modal');
    if (!modal) return;

    const kpiRow = modal.querySelector('.modal-kpi-row');
    if (kpiRow) kpiRow.style.display = 'none';

    const rawOpp = data.W11_Opponent || data.W10_Opponent || '';
    const currentWk = (appData.meta && appData.meta.currentWeek) || 10;
    const lookAheadWk = (appData.meta && appData.meta.lookAheadWeek) || 11;
    document.getElementById('modal-matchup-title').innerHTML = `<div class="team-cell" style="display:inline-flex;">${renderTeamLogoHtml(data.Stash_DST, data.Stash_DST, 'lg')} <span>Week ${lookAheadWk} Stash: ${data.Stash_DST} vs ${rawOpp}</span></div>`;
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
    if (defInjEl) defInjEl.textContent = `See Week ${currentWk} Tab`;

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

  // 13. One-Click Copy Cheat Sheet to Clipboard Logic
  function setupCopyCheatSheet() {
    const btn = document.getElementById('btn-copy-cheatsheet');
    const copyIcon = document.getElementById('copy-icon');
    const copyText = document.getElementById('copy-text');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      if (!appData || !appData.weekMatchups) return;
      try {
        const active = appData.weekMatchups.filter(m => m.Target_DST && !m.Target_DST.includes('BYE'));
        const sorted = [...active].sort((a, b) => (parseFloat(b.Proj_Fantasy_Pts) || 0) - (parseFloat(a.Proj_Fantasy_Pts) || 0));

        const topSmash = sorted[0];
        const priorityTargets = sorted.filter(m => (m.Streamer_Tier || '').includes('Priority') && m !== topSmash);
        const speculativeTargets = sorted.filter(m => (m.Streamer_Tier || '').includes('Speculative')).slice(0, 4);

        const meta = appData.meta || { currentWeek: 10, lookAheadWeek: 11, lastUpdated: 'Nov 12, 2026' };
        const topStash = (appData.lookAheadStashes && appData.lookAheadStashes[0]) || null;
        const windy = active.filter(m => (m.Gametime_Weather || '').toLowerCase().includes('wind') || (m.Gametime_Weather || '').toLowerCase().includes('gust'));

        let text = `🏈 WEEK ${meta.currentWeek} DEFENSIVE STREAMING CHEAT SHEET (WAFFLe League)\n`;
        text += `Updated: ${meta.lastUpdated || 'Current'}\n\n`;

        if (topSmash) {
          text += `🔥 #1 SMASH PLAY:\n`;
          text += `• ${topSmash.Target_DST} vs ${topSmash.Offense} — ${formatNum(topSmash.Proj_Fantasy_Pts, 1)} Proj Pts (Floor: ${formatNum(topSmash.Predicted_Floor, 1)}, Sacks: ${formatNum(topSmash.Proj_Sacks, 1)}) | 3-Wk Runway: ${topSmash.Runway_Grade || 'A'}\n\n`;
        }

        if (priorityTargets.length > 0) {
          text += `🎯 PRIORITY TARGETS:\n`;
          priorityTargets.forEach((m, i) => {
            text += `${i + 1}. ${m.Target_DST} vs ${m.Offense} — ${formatNum(m.Proj_Fantasy_Pts, 1)} pts (Floor: ${formatNum(m.Predicted_Floor, 1)}) | Opp L4: ${m.Last_4_Games} pts | Runway: ${m.Runway_Grade || 'B'}\n`;
          });
          text += `\n`;
        }

        if (speculativeTargets.length > 0) {
          text += `🎲 SPECULATIVE UPSIDE PLAYS:\n`;
          speculativeTargets.forEach((m) => {
            text += `• ${m.Target_DST} vs ${m.Offense} — ${formatNum(m.Proj_Fantasy_Pts, 1)} pts (Vegas: ${formatNum(m.Opp_Implied_Pts, 1)} pts)\n`;
          });
          text += `\n`;
        }

        if (topStash) {
          const stashOpp = topStash.W11_Opponent || topStash.W10_Opponent || '';
          text += `🔮 TOP WEEK ${meta.lookAheadWeek || 11} LOOK-AHEAD STASH:\n`;
          text += `• ${topStash.Stash_DST} (W${meta.lookAheadWeek || 11}: ${stashOpp}) — ${topStash.Opp_Last_4} pts allowed L4\n\n`;
        }

        if (windy.length > 0) {
          text += `💨 WEATHER IMPACT ALERTS:\n`;
          text += `• High Wind Gusts: ${windy.map(w => w.Target_DST.split(' ')[0]).join(', ')}\n\n`;
        }

        text += `📊 Interactive Rankings, 3-Week Runway & Playoff Radar:\nhttps://paulberman28-code.github.io/Fantasy-Football-Defense-Streamer-Tool/`;

        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }

        btn.classList.add('copied');
        if (copyIcon) copyIcon.textContent = '✅';
        if (copyText) copyText.textContent = 'Copied to Clipboard!';

        if (typeof gtag === 'function') {
          gtag('event', 'copy_cheat_sheet', { week: meta.currentWeek });
        }

        setTimeout(() => {
          btn.classList.remove('copied');
          if (copyIcon) copyIcon.textContent = '📋';
          if (copyText) copyText.textContent = 'Copy Cheat Sheet';
        }, 2500);
      } catch (err) {
        console.error('Failed to copy cheat sheet:', err);
      }
    });
  }

  // 14. Start 'Em / Sit 'Em Head-to-Head Comparison Decider Modal
  function setupCompareModal() {
    const modal = document.getElementById('compare-modal');
    const openBtn = document.getElementById('btn-compare-modal');
    const closeBtn = document.getElementById('compare-close-btn');
    const selectA = document.getElementById('select-def-a');
    const selectB = document.getElementById('select-def-b');
    const verdictBox = document.getElementById('compare-verdict-box');
    const tbody = document.getElementById('compare-tbody');
    const thA = document.getElementById('compare-th-a');
    const thB = document.getElementById('compare-th-b');

    if (!modal || !openBtn || !selectA || !selectB) return;

    if (closeBtn) closeBtn.addEventListener('click', () => modal.close());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.close();
    });

    function populateSelects() {
      if (!appData || !appData.weekMatchups) return;
      const active = appData.weekMatchups.filter(m => m.Target_DST && !m.Target_DST.includes('BYE'));
      const sorted = [...active].sort((a, b) => (parseFloat(b.Proj_Fantasy_Pts) || 0) - (parseFloat(a.Proj_Fantasy_Pts) || 0));

      const optionsHtml = sorted.map((m, i) => {
        const teamCode = m.Target_DST.split(' ')[0];
        return `<option value="${teamCode}" ${i === 0 ? 'selected' : ''}>${formatDstLabel(m.Target_DST)} (${formatNum(m.Proj_Fantasy_Pts, 1)} pts)</option>`;
      }).join('');

      selectA.innerHTML = optionsHtml;
      selectB.innerHTML = optionsHtml;

      if (sorted.length > 1) {
        selectB.selectedIndex = 1;
      }
    }

    function runComparison() {
      if (!appData || !appData.weekMatchups) return;
      const codeA = selectA.value;
      const codeB = selectB.value;

      const teamA = appData.weekMatchups.find(m => m.Target_DST && m.Target_DST.split(' ')[0] === codeA);
      const teamB = appData.weekMatchups.find(m => m.Target_DST && m.Target_DST.split(' ')[0] === codeB);

      if (!teamA || !teamB) return;

      const ptsA = parseFloat(teamA.Proj_Fantasy_Pts) || 0;
      const ptsB = parseFloat(teamB.Proj_Fantasy_Pts) || 0;
      const diff = Math.abs(ptsA - ptsB);

      // Update Table Headers
      thA.innerHTML = `<div class="team-cell" style="justify-content:center;">${renderTeamLogoHtml(codeA, codeA)} <span>${formatDstLabel(teamA.Target_DST)}</span></div>`;
      thB.innerHTML = `<div class="team-cell" style="justify-content:center;">${renderTeamLogoHtml(codeB, codeB)} <span>${formatDstLabel(teamB.Target_DST)}</span></div>`;

      // Determine verdict
      let verdictTitle = '';
      let verdictDesc = '';

      if (codeA === codeB) {
        verdictTitle = 'Identical Defense Selected';
        verdictDesc = 'Please select two different defenses to see the head-to-head matchup comparison.';
      } else if (diff < 0.3) {
        const higherFloor = (parseFloat(teamA.Predicted_Floor) || 0) >= (parseFloat(teamB.Predicted_Floor) || 0) ? teamA : teamB;
        verdictTitle = `⚖️ Virtual Toss-Up: Lean ${formatDstLabel(higherFloor.Target_DST)}`;
        verdictDesc = `Both defenses are separated by just ${diff.toFixed(1)} projected fantasy points. Lean <strong>${formatDstLabel(higherFloor.Target_DST)}</strong> due to superior scoring floor (${formatNum(higherFloor.Predicted_Floor, 1)} pts) and safer sack baseline.`;
      } else {
        const winner = ptsA > ptsB ? teamA : teamB;
        const loser = ptsA > ptsB ? teamB : teamA;
        verdictTitle = `🏆 Start ${formatDstLabel(winner.Target_DST)} over ${formatDstLabel(loser.Target_DST)} (+${diff.toFixed(1)} Pts)`;
        verdictDesc = `<strong>${formatDstLabel(winner.Target_DST)}</strong> projects for <strong>${formatNum(winner.Proj_Fantasy_Pts, 1)} points</strong> compared to ${formatNum(loser.Proj_Fantasy_Pts, 1)} for ${formatDstLabel(loser.Target_DST)}. Key advantages: higher expected scoring floor (${formatNum(winner.Predicted_Floor, 1)} vs ${formatNum(loser.Predicted_Floor, 1)}) and higher turnover upside against ${winner.Offense}.`;
      }

      verdictBox.innerHTML = `
        <div class="verdict-header">
          <span class="verdict-title">${verdictTitle}</span>
        </div>
        <p class="verdict-desc">${verdictDesc}</p>
      `;

      // Comparison Metrics rows
      const metrics = [
        {
          label: 'Streaming Tier',
          getVal: (m) => `<span class="badge ${getTierClass(m.Streamer_Tier)}">${m.Streamer_Tier}</span>`,
          winner: 0
        },
        {
          label: 'Projected Fantasy Points',
          getVal: (m) => `<strong>${formatNum(m.Proj_Fantasy_Pts, 1)} pts</strong>`,
          winner: ptsA === ptsB ? 0 : (ptsA > ptsB ? 1 : 2)
        },
        {
          label: 'Scoring Floor (Safe Floor)',
          getVal: (m) => `${formatNum(m.Predicted_Floor, 1)} pts`,
          winner: (parseFloat(teamA.Predicted_Floor) || 0) === (parseFloat(teamB.Predicted_Floor) || 0) ? 0 : ((parseFloat(teamA.Predicted_Floor) || 0) > (parseFloat(teamB.Predicted_Floor) || 0) ? 1 : 2)
        },
        {
          label: 'Projected Sacks',
          getVal: (m) => `${formatNum(m.Proj_Sacks, 1)} sacks`,
          winner: (parseFloat(teamA.Proj_Sacks) || 0) === (parseFloat(teamB.Proj_Sacks) || 0) ? 0 : ((parseFloat(teamA.Proj_Sacks) || 0) > (parseFloat(teamB.Proj_Sacks) || 0) ? 1 : 2)
        },
        {
          label: 'Projected Turnovers (INT + Fum)',
          getVal: (m) => `${((parseFloat(m.Proj_INTs) || 0) + (parseFloat(m.Proj_Fumbles) || 0)).toFixed(1)} (${formatNum(m.Proj_INTs, 1)} INT / ${formatNum(m.Proj_Fumbles, 1)} Fum)`,
          winner: ((parseFloat(teamA.Proj_INTs) || 0) + (parseFloat(teamA.Proj_Fumbles) || 0)) === ((parseFloat(teamB.Proj_INTs) || 0) + (parseFloat(teamB.Proj_Fumbles) || 0)) ? 0 : (((parseFloat(teamA.Proj_INTs) || 0) + (parseFloat(teamA.Proj_Fumbles) || 0)) > ((parseFloat(teamB.Proj_INTs) || 0) + (parseFloat(teamB.Proj_Fumbles) || 0)) ? 1 : 2)
        },
        {
          label: 'Opponent L4 Pts Allowed',
          getVal: (m) => `${m.Last_4_Games} pts (${(m.Last_4_Games / 4).toFixed(1)}/g)`,
          winner: parseFloat(teamA.Last_4_Games) === parseFloat(teamB.Last_4_Games) ? 0 : (parseFloat(teamA.Last_4_Games) > parseFloat(teamB.Last_4_Games) ? 1 : 2)
        },
        {
          label: 'Def Quality Index (DQI)',
          getVal: (m) => `<span class="dqi-badge ${getDqiClass(m.Def_DQI)}">${m.Def_DQI !== '-' ? formatNum(m.Def_DQI, 1) : '—'}</span>`,
          winner: (parseFloat(teamA.Def_DQI) || 0) === (parseFloat(teamB.Def_DQI) || 0) ? 0 : ((parseFloat(teamA.Def_DQI) || 0) > (parseFloat(teamB.Def_DQI) || 0) ? 1 : 2)
        },
        {
          label: 'Vegas Implied Opponent Score',
          getVal: (m) => `${formatNum(m.Opp_Implied_Pts, 1)} pts`,
          winner: parseFloat(teamA.Opp_Implied_Pts) === parseFloat(teamB.Opp_Implied_Pts) ? 0 : (parseFloat(teamA.Opp_Implied_Pts) < parseFloat(teamB.Opp_Implied_Pts) ? 1 : 2) // lower is better
        },
        {
          label: '3-Week Runway Grade',
          getVal: (m) => renderRunwayCell(m.Runway_W10_W12 || m.Runway_W9_W11, m.Runway_Grade),
          winner: 0
        },
        {
          label: 'Opponent QB & Status',
          getVal: (m) => formatQbCell(m.Starting_QB),
          winner: 0
        },
        {
          label: 'Kickoff Weather Environment',
          getVal: (m) => m.Gametime_Weather || 'Standard',
          winner: 0
        }
      ];

      tbody.innerHTML = metrics.map(met => {
        const valA = met.getVal(teamA);
        const valB = met.getVal(teamB);
        const advA = met.winner === 1 ? `<span class="adv-pill">✓ Advantage</span>` : '';
        const advB = met.winner === 2 ? `<span class="adv-pill">✓ Advantage</span>` : '';

        return `
          <tr>
            <td class="col-metric">${met.label}</td>
            <td class="col-team ${met.winner === 1 ? 'col-adv' : ''}">${valA} ${advA}</td>
            <td class="col-team ${met.winner === 2 ? 'col-adv' : ''}">${valB} ${advB}</td>
          </tr>
        `;
      }).join('');
    }

    selectA.addEventListener('change', runComparison);
    selectB.addEventListener('change', runComparison);

    openBtn.addEventListener('click', () => {
      populateSelects();
      runComparison();
      if (typeof gtag === 'function') {
        gtag('event', 'open_compare_modal');
      }
      modal.showModal();
    });
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

  // 12. Global Visitor Counter Logic (Synchronized Cloud Counter + Session-Aware)
  function initVisitorCounter() {
    const counterEl = document.getElementById('visitor-count');
    if (!counterEl) return;

    // Canonical tracking URL for WAFFLe Streamer Tool on GitHub Pages
    const TRACKING_URL = 'https://paulberman28-code.github.io/Fantasy-Football-Defense-Streamer-Tool/';

    // 1. Immediately show cached global count to prevent layout shift
    const cachedVisits = parseInt(localStorage.getItem('waffle_global_hits_v1') || '0', 10);
    if (cachedVisits > 0) {
      counterEl.textContent = cachedVisits.toLocaleString();
    }

    // 2. When online via HTTP/HTTPS, sync with the global cloud counter
    if (window.location.protocol.startsWith('http')) {
      const sessionKey = 'waffle_global_session_logged';
      const hasCountedSession = sessionStorage.getItem(sessionKey);

      // New session: increment the global counter via /api/hit
      // Existing session (page reload or tab switch): read current global count via /api/history without double-counting
      const apiUrl = hasCountedSession
        ? `https://hitscounter.dev/api/history?url=${encodeURIComponent(TRACKING_URL)}`
        : `https://hitscounter.dev/api/hit?url=${encodeURIComponent(TRACKING_URL)}&output=json`;

      fetch(apiUrl)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          if (data && typeof data.total_hits === 'number' && data.total_hits > 0) {
            counterEl.textContent = data.total_hits.toLocaleString();
            localStorage.setItem('waffle_global_hits_v1', data.total_hits);
            if (!hasCountedSession) {
              sessionStorage.setItem(sessionKey, 'true');
            }
          }
        })
        .catch(err => {
          console.warn('Global visitor counter notice:', err.message);
        });
    } else {
      // Local file:// protocol fallback for offline dev/testing
      let localVisits = parseInt(localStorage.getItem('waffle_local_visits_preview') || '0', 10);
      if (!sessionStorage.getItem('waffle_local_session')) {
        localVisits += 1;
        localStorage.setItem('waffle_local_visits_preview', localVisits);
        sessionStorage.setItem('waffle_local_session', 'true');
      }
      counterEl.textContent = localVisits.toLocaleString();
    }
  }
});
