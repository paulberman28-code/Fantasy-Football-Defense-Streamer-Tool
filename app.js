/**
 * NFL Fantasy D/ST Streamer Tool
 * Interactive Client-Side Dashboard
 */

document.addEventListener('DOMContentLoaded', async () => {
  // State management
  let appData = null;
  let activeTab = 'week9';
  
  // Sort states for each table
  const sortStates = {
    week9: { column: 'Projected Fantasy Points', ascending: false },
    week10: { column: 'Opponent L4 Points Allowed', ascending: false },
    history: { column: 'Total Points Allowed (W1-8)', ascending: false }
  };

  // Filter states
  const filters = {
    search: '',
    tier: 'ALL',
    w10Verdict: 'ALL',
    backupOnly: false,
    weatherOnly: false
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
          document.getElementById('kpi-smash-name').textContent = topSmash.Target_DST;
          document.getElementById('kpi-smash-sub').textContent = `${formatNum(topSmash.Proj_Fantasy_Pts, 1)} Proj Pts • vs ${topSmash.Team}`;
        }

        // Top Floor Play
        const topFloor = [...active].sort((a, b) => (parseFloat(b.Predicted_Floor) || 0) - (parseFloat(a.Predicted_Floor) || 0))[0];
        if (topFloor) {
          document.getElementById('kpi-floor-name').textContent = topFloor.Target_DST;
          document.getElementById('kpi-floor-sub').textContent = `${formatNum(topFloor.Predicted_Floor, 1)} Floor • ${formatNum(topFloor.Proj_Sacks, 1)} Sacks`;
        }

        // Weather Alert
        const windy = active.filter(m => (m.Gametime_Weather || '').toLowerCase().includes('wind') || (m.Gametime_Weather || '').toLowerCase().includes('gust'));
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
        updateFilterVisibility();
        renderActiveTable();
      });
    });
  }

  function updateFilterVisibility() {
    const w9Controls = document.getElementById('week9-filters');
    const w10Controls = document.getElementById('week10-filters');
    if (activeTab === 'week9') {
      if (w9Controls) w9Controls.style.display = 'flex';
      if (w10Controls) w10Controls.style.display = 'none';
    } else if (activeTab === 'week10') {
      if (w9Controls) w9Controls.style.display = 'none';
      if (w10Controls) w10Controls.style.display = 'flex';
    } else {
      if (w9Controls) w9Controls.style.display = 'none';
      if (w10Controls) w10Controls.style.display = 'none';
    }
  }

  // 4. Filter Event Listeners
  function setupFilterEvents() {
    const searchInput = document.getElementById('global-search');
    searchInput.addEventListener('input', (e) => {
      filters.search = e.target.value.toLowerCase().trim();
      renderActiveTable();
    });

    const tierSelect = document.getElementById('tier-filter');
    tierSelect.addEventListener('change', (e) => {
      filters.tier = e.target.value;
      renderActiveTable();
    });

    const backupToggle = document.getElementById('backup-qb-toggle');
    backupToggle.addEventListener('change', (e) => {
      filters.backupOnly = e.target.checked;
      renderActiveTable();
    });

    const weatherToggle = document.getElementById('weather-toggle');
    weatherToggle.addEventListener('change', (e) => {
      filters.weatherOnly = e.target.checked;
      renderActiveTable();
    });

    const resetBtn = document.getElementById('reset-filters-btn');
    resetBtn.addEventListener('click', () => {
      searchInput.value = '';
      filters.search = '';
      tierSelect.value = 'ALL';
      filters.tier = 'ALL';
      backupToggle.checked = false;
      filters.backupOnly = false;
      weatherToggle.checked = false;
      filters.weatherOnly = false;
      renderActiveTable();
    });

    // Week 10 Specific Filters
    const w10VerdictSelect = document.getElementById('w10-tier-filter');
    if (w10VerdictSelect) {
      w10VerdictSelect.addEventListener('change', (e) => {
        filters.w10Verdict = e.target.value;
        renderActiveTable();
      });
    }

    const resetW10Btn = document.getElementById('reset-w10-filters-btn');
    if (resetW10Btn) {
      resetW10Btn.addEventListener('click', () => {
        searchInput.value = '';
        filters.search = '';
        if (w10VerdictSelect) w10VerdictSelect.value = 'ALL';
        filters.w10Verdict = 'ALL';
        renderActiveTable();
      });
    }
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
  }

  function renderActiveTable() {
    if (activeTab === 'week9') renderWeek9Projections();
    else if (activeTab === 'week10') renderWeek10Stashes();
    else if (activeTab === 'history') renderHistory();
  }

  // 7. Render Tab 1: Week 9 Projections
  function renderWeek9Projections() {
    const tbody = document.getElementById('projections-tbody');
    if (!tbody || !appData.weekMatchups) return;

    // Filter out BYE teams for streaming view
    let rows = appData.weekMatchups.filter(m => m.Target_DST && !m.Target_DST.includes('BYE'));

    // Apply User Filters
    if (filters.search) {
      rows = rows.filter(m => {
        const text = `${m.Target_DST} ${m.Offense} ${m.Starting_QB} ${m.Streamer_Tier}`.toLowerCase();
        return text.includes(filters.search);
      });
    }

    if (filters.tier === 'TARGETS_ONLY') {
      rows = rows.filter(m => m.Streamer_Tier === 'Priority Stream' || m.Streamer_Tier === 'Speculative Stream');
    } else if (filters.tier && filters.tier !== 'ALL') {
      rows = rows.filter(m => m.Streamer_Tier === filters.tier);
    }

    if (filters.backupOnly) {
      rows = rows.filter(m => m.Starting_QB && (m.Starting_QB.includes('Backup') || m.Starting_QB.includes('Yes')));
    }

    if (filters.weatherOnly) {
      rows = rows.filter(m => {
        const w = (m.Gametime_Weather || '').toLowerCase();
        return w.includes('wind') || w.includes('rain') || w.includes('gust');
      });
    }

    // Sort
    const sortConfig = sortStates.week9;
    const keyMap = {
      'Streaming Defense': 'Target_DST',
      'Opponent Offense': 'Offense',
      'Opposing QB (Status)': 'Starting_QB',
      'Week 9 Verdict': 'Streamer_Tier',
      'Streaming Tier': 'Streamer_Tier',
      'Projected Fantasy Points': 'Proj_Fantasy_Pts',
      'Scoring Floor': 'Predicted_Floor',
      'Projected Sacks': 'Proj_Sacks',
      'Projected Interceptions': 'Proj_INTs',
      'Sack Rate on Pressure %': 'Sacks_Per_Press%',
      'Pass Efficiency Allowed (EPA/Play)': 'Off_Pass_EPA_L4',
      'Avg Time to Throw (Sec)': 'NGS_TTT',
      'Tight-Window Throw %': 'NGS_Agg%',
      'Vegas Implied Opponent Score': 'Opp_Implied_Pts',
      'Game-Time Kickoff Weather': 'Gametime_Weather'
    };

    const targetKey = keyMap[sortConfig.column] || sortConfig.column;
    rows = sortData(rows, targetKey, sortConfig.ascending);

    document.getElementById('active-count-label').textContent = `Showing ${rows.length} Matchups`;

    // Render HTML
    tbody.innerHTML = rows.map((r, idx) => {
      let qbDisplay = r.Starting_QB || '-';
      if (qbDisplay.includes('Backup:')) {
        qbDisplay = qbDisplay.replace(/\(Backup:\s*([^)]*)\)/i, '<span class="qb-backup-badge">Backup: $1</span>');
      } else if (qbDisplay.includes('(Starter)')) {
        qbDisplay = qbDisplay.replace(/\(Starter\)/i, '<span class="qb-starter-badge">Starter</span>');
      } else if (qbDisplay.includes('(No)')) {
        qbDisplay = qbDisplay.replace(/\(No\)/i, '<span class="qb-starter-badge">Starter</span>');
      } else if (qbDisplay.includes('(Yes')) {
        qbDisplay = qbDisplay.replace(/\(Yes\s*\(?([^)]*)\)?\)/i, '<span class="qb-backup-badge">Backup: $1</span>');
      }
      
      // Weather pill style
      const weatherText = r.Gametime_Weather || 'N/A';
      const isWind = weatherText.toLowerCase().includes('wind') || weatherText.toLowerCase().includes('gust');
      const isDome = weatherText.toLowerCase().includes('dome');
      const weatherClass = isWind ? 'weather-wind' : (isDome ? 'weather-dome' : '');
      const weatherIcon = isWind ? '🌬️' : (isDome ? '🏟️' : '☀️');

      // Tier class
      const tierClass = getTierClass(r.Streamer_Tier);

      return `
        <tr data-row-idx="${idx}" class="matchup-row">
          <td class="col-sticky">
            <div class="team-badge">
              <span class="stat-bold">${r.Target_DST}</span>
            </div>
          </td>
          <td>${qbDisplay}</td>
          <td class="col-center"><span class="badge ${tierClass}">${r.Streamer_Tier}</span></td>
          <td class="col-center"><span class="pts-highlight ${parseFloat(r.Proj_Fantasy_Pts) >= 9 ? 'pts-top' : ''}">${formatNum(r.Proj_Fantasy_Pts, 1)}</span></td>
          <td class="col-center stat-bold">${formatNum(r.Predicted_Floor, 1)}</td>
          <td class="col-center">${formatNum(r.Proj_Sacks, 1)}</td>
          <td class="col-center ${parseFloat(r.Proj_INTs) >= 1.5 ? 'stat-bold' : ''}">${formatNum(r.Proj_INTs, 1)}</td>
          <td class="col-center">${formatNum(r['Sacks_Per_Press%'], 1)}%</td>
          <td class="col-center ${parseFloat(r.Off_Pass_EPA_L4) < 0 ? 'pts-top' : ''}">${parseFloat(r.Off_Pass_EPA_L4) > 0 ? '+' : ''}${formatNum(r.Off_Pass_EPA_L4, 3)}</td>
          <td class="col-center">${r.NGS_TTT !== '-' ? formatNum(r.NGS_TTT, 2) + 's' : '—'}</td>
          <td class="col-center">${r['NGS_Agg%'] !== '-' ? formatNum(r['NGS_Agg%'], 1) + '%' : '—'}</td>
          <td class="col-center">${formatNum(r.Opp_Implied_Pts, 1)} pts</td>
          <td><span class="weather-pill ${weatherClass}">${weatherIcon} ${weatherText}</span></td>
          <td style="white-space: normal; min-width: 380px;">${r.Current_Week_Rationale || 'Standard matchup projection.'}</td>
        </tr>
      `;
    }).join('');
  }

  // 8. Render Tab 2: Week 10 Look-Ahead Stashes
  function renderWeek10Stashes() {
    const tbody = document.getElementById('stashes-tbody');
    if (!tbody || !appData.lookAheadStashes) return;

    let rows = [...appData.lookAheadStashes];

    if (filters.search) {
      rows = rows.filter(s => {
        const text = `${s.Stash_DST} ${s.W10_Opponent} ${s.Opp_QB} ${s.Stash_Tier || ''} ${s.Look_Ahead_Rationale}`.toLowerCase();
        return text.includes(filters.search);
      });
    }

    if (filters.w10Verdict === 'TARGETS_ONLY') {
      rows = rows.filter(s => s.Stash_Tier === 'Priority Stash' || s.Stash_Tier === 'Speculative Stash');
    } else if (filters.w10Verdict && filters.w10Verdict !== 'ALL') {
      rows = rows.filter(s => s.Stash_Tier === filters.w10Verdict);
    }

    const countLabel = document.getElementById('active-count-label');
    if (countLabel && activeTab === 'week10') {
      countLabel.textContent = `Showing ${rows.length} Week 10 Matchups`;
    }

    const sortConfig = sortStates.week10;
    const keyMap = {
      'Defense': 'Stash_DST',
      'Stash Defense': 'Stash_DST',
      'Week 10 Opponent': 'W10_Opponent',
      'Week 10 Verdict': 'Tier_Rank',
      'Opponent L4 Points Allowed': 'Opp_Last_4',
      'Opponent Total Points Allowed': 'Opp_Total_Pts',
      'Opponent Starting QB': 'Opp_QB'
    };
    const targetKey = keyMap[sortConfig.column] || sortConfig.column;
    rows = sortData(rows, targetKey, sortConfig.ascending);

    tbody.innerHTML = rows.map(s => {
      const tierBadgeClass = getStashBadgeClass(s.Stash_Tier);
      return `
        <tr>
          <td class="col-sticky"><span class="stat-bold">${s.Stash_DST}</span></td>
          <td>${s.W10_Opponent}</td>
          <td class="col-center"><span class="badge ${tierBadgeClass}">${s.Stash_Tier || 'Neutral Matchup'}</span></td>
          <td class="col-center"><span class="pts-highlight ${s.Opp_Last_4 >= 30 ? 'pts-top' : ''}">${s.Opp_Last_4} pts</span> <span class="stat-dim">(${(s.Opp_Last_4 / 4).toFixed(1)}/g)</span></td>
          <td class="col-center"><span class="stat-bold">${s.Opp_Total_Pts} pts</span></td>
          <td>${s.Opp_QB}</td>
          <td style="white-space: normal; min-width: 380px;">${s.Look_Ahead_Rationale}</td>
        </tr>
      `;
    }).join('');
  }

  function getStashBadgeClass(tier) {
    if (!tier) return 'stash-neutral';
    if (tier.includes('Priority')) return 'stash-priority';
    if (tier.includes('Speculative')) return 'stash-speculative';
    if (tier.includes('Avoid') || tier.includes('Do Not Stash')) return 'stash-avoid';
    return 'stash-neutral';
  }

  // 9. Render Tab 3: Historical Offense Vulnerability (W1–W8)
  function renderHistory() {
    const tbody = document.getElementById('history-tbody');
    if (!tbody || !appData.historicalOffenses) return;

    let rows = [...appData.historicalOffenses];

    if (filters.search) {
      rows = rows.filter(h => {
        const text = `${h.Offense} ${h.Team} ${h.Starting_QB}`.toLowerCase();
        return text.includes(filters.search);
      });
    }

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
          <td class="col-sticky"><span class="stat-bold">${h.Offense}</span></td>
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
          <td>${h.Target_DST || 'BYE'}</td>
          <td>${h.Starting_QB || '-'}</td>
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

  // 10. Modal Logic
  function setupModalEvents() {
    const modal = document.getElementById('rationale-modal');
    const closeBtn = document.getElementById('modal-close-btn');

    closeBtn.addEventListener('click', () => modal.close());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.close();
    });
  }

  function openModal(data) {
    const modal = document.getElementById('rationale-modal');
    if (!modal) return;

    document.getElementById('modal-matchup-title').textContent = `${data.Target_DST} vs ${data.Offense}`;
    document.getElementById('modal-tier-badge').textContent = data.Streamer_Tier;
    document.getElementById('modal-tier-badge').className = `badge tier-badge ${getTierClass(data.Streamer_Tier)}`;

    document.getElementById('modal-proj-pts').textContent = formatNum(data.Proj_Fantasy_Pts, 1);
    document.getElementById('modal-floor').textContent = formatNum(data.Predicted_Floor, 1);
    document.getElementById('modal-sacks').textContent = formatNum(data.Proj_Sacks, 1);
    document.getElementById('modal-ints').textContent = formatNum(data.Proj_INTs, 1);
    document.getElementById('modal-implied').textContent = `${formatNum(data.Opp_Implied_Pts, 1)} pts`;

    document.getElementById('modal-qb').textContent = data.Starting_QB;
    document.getElementById('modal-weather').textContent = data.Gametime_Weather;
    document.getElementById('modal-sp').textContent = `${formatNum(data['Sacks_Per_Press%'], 1)}%`;
    document.getElementById('modal-epa').textContent = `${parseFloat(data.Off_Pass_EPA_L4) > 0 ? '+' : ''}${formatNum(data.Off_Pass_EPA_L4, 3)}`;

    document.getElementById('modal-rationale-text').textContent = data.Current_Week_Rationale || 'Matchup analysis pending.';

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
