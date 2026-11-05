import pandas as pd
import numpy as np
import requests
import nfl_data_py as nfl

def get_gametime_weather(w9_sched):
    """
    Retrieves precise 3-hour game-time weather forecast from Open-Meteo
    for outdoor games based on exact kickoff date and time.
    """
    stadium_info = {
        'BAL': {'name': 'M&T Bank Stadium', 'lat': 39.28, 'lon': -76.62, 'tz': 'America/New_York', 'roof': 'outdoors', 'utc_offset': -5},
        'ATL': {'name': 'Bernabeu (Madrid)', 'lat': 40.45, 'lon': -3.69, 'tz': 'Europe/Madrid', 'roof': 'retractable', 'utc_offset': 1},
        'CAR': {'name': 'Bank of America Stadium', 'lat': 35.23, 'lon': -80.85, 'tz': 'America/New_York', 'roof': 'outdoors', 'utc_offset': -5},
        'IND': {'name': 'Lucas Oil Stadium', 'lat': 39.76, 'lon': -86.16, 'tz': 'America/Indiana/Indianapolis', 'roof': 'dome', 'utc_offset': -5},
        'KC': {'name': 'Arrowhead Stadium', 'lat': 39.05, 'lon': -94.48, 'tz': 'America/Chicago', 'roof': 'outdoors', 'utc_offset': -6},
        'MIA': {'name': 'Hard Rock Stadium', 'lat': 25.96, 'lon': -80.24, 'tz': 'America/New_York', 'roof': 'outdoors', 'utc_offset': -5},
        'NO': {'name': 'Caesars Superdome', 'lat': 29.95, 'lon': -90.08, 'tz': 'America/Chicago', 'roof': 'dome', 'utc_offset': -6},
        'PHI': {'name': 'Lincoln Financial Field', 'lat': 39.90, 'lon': -75.17, 'tz': 'America/New_York', 'roof': 'outdoors', 'utc_offset': -5},
        'WAS': {'name': 'Northwest Stadium', 'lat': 38.91, 'lon': -76.86, 'tz': 'America/New_York', 'roof': 'outdoors', 'utc_offset': -5},
        'LAC': {'name': 'SoFi Stadium', 'lat': 33.95, 'lon': -118.34, 'tz': 'America/Los_Angeles', 'roof': 'dome', 'utc_offset': -8},
        'SF': {'name': "Levi's Stadium", 'lat': 37.40, 'lon': -121.97, 'tz': 'America/Los_Angeles', 'roof': 'outdoors', 'utc_offset': -8},
        'NE': {'name': 'Gillette Stadium', 'lat': 42.09, 'lon': -71.26, 'tz': 'America/New_York', 'roof': 'outdoors', 'utc_offset': -5},
        'SEA': {'name': 'Lumen Field', 'lat': 47.60, 'lon': -122.33, 'tz': 'America/Los_Angeles', 'roof': 'outdoors', 'utc_offset': -8},
        'CHI': {'name': 'Soldier Field', 'lat': 41.86, 'lon': -87.62, 'tz': 'America/Chicago', 'roof': 'outdoors', 'utc_offset': -6},
        'MIN': {'name': 'U.S. Bank Stadium', 'lat': 44.97, 'lon': -93.26, 'tz': 'America/Chicago', 'roof': 'dome', 'utc_offset': -6},
    }

    weather_by_team = {}
    for _, r in w9_sched.iterrows():
        home = r['home_team']
        away = r['away_team']
        date = str(r['gameday'])
        et_time = str(r['gametime'])
        st = stadium_info.get(home, {})
        
        if st.get('roof') in ['dome', 'retractable']:
            cond = 'Dome (Indoors)'
        else:
            try:
                et_hour = int(et_time.split(':')[0])
                local_hour = et_hour + (st['utc_offset'] - (-5))
                
                url = f"https://api.open-meteo.com/v1/forecast?latitude={st['lat']}&longitude={st['lon']}&hourly=temperature_2m,precipitation,snowfall,wind_speed_10m,wind_gusts_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone={st['tz']}&start_date={date}&end_date={date}"
                res = requests.get(url, timeout=5).json().get('hourly', {})
                
                hours = range(local_hour, min(local_hour + 4, 24))
                temps = [res['temperature_2m'][h] for h in hours]
                winds = [res['wind_speed_10m'][h] for h in hours]
                gusts = [res['wind_gusts_10m'][h] for h in hours]
                precips = [res['precipitation'][h] for h in hours]
                snows = [res['snowfall'][h] for h in hours]

                avg_temp = sum(temps) / len(temps)
                max_wind = max(winds)
                max_gust = max(gusts)
                total_rain = sum(precips)
                total_snow = sum(snows)

                alerts = []
                if max_gust >= 35:
                    alerts.append(f'Severe Gusts ({max_gust:.0f} mph)')
                elif max_gust >= 25 or max_wind >= 15:
                    alerts.append(f'Windy ({max_wind:.0f} mph, g{max_gust:.0f})')
                if total_snow > 0:
                    alerts.append(f'Snow ({total_snow:.1f}")')
                elif total_rain >= 0.25:
                    alerts.append(f'Heavy Rain ({total_rain:.2f}")')
                elif total_rain >= 0.05:
                    alerts.append(f'Rain ({total_rain:.2f}")')
                if avg_temp <= 35:
                    alerts.append(f'Freezing ({avg_temp:.0f}°F)')

                cond = ', '.join(alerts) if alerts else f'Clear / Mild ({avg_temp:.0f}°F, {max_wind:.0f}mph)'
            except Exception:
                cond = 'Outdoor (Forecast Unavailable)'

        weather_by_team[home] = cond
        weather_by_team[away] = cond

    return weather_by_team

def calc_bracket_pts(imp_pts):
    """
    Computes mathematically expected fantasy points from the points allowed brackets:
    0 pts: 10 pts | 1-6 pts: 7 pts | 7-13 pts: 3 pts | 14+ pts: 0 pts
    """
    if imp_pts > 28:
        p0, p1_6, p7_13 = 0.005, 0.02, 0.05
    else:
        p0 = max(0.01, 0.08 - (imp_pts - 14) * 0.005)
        p1_6 = max(0.03, 0.16 - (imp_pts - 14) * 0.010)
        p7_13 = max(0.08, 0.38 - (imp_pts - 14) * 0.022)
    return p0 * 10.0 + p1_6 * 7.0 + p7_13 * 3.0

def main():
    print("Loading 2026 NFL play-by-play, schedules, and Next Gen Stats...")
    pbp = nfl.import_pbp_data([2026])
    sched = nfl.import_schedules([2026])
    ngs = nfl.import_ngs_data('passing', [2026])

    pbp_reg = pbp[(pbp['season_type'] == 'REG') & (pbp['week'] <= 8)].copy()
    sched_reg = sched[(sched['game_type'] == 'REG') & (sched['week'] <= 8)].copy()
    w9_sched = sched[sched['week'] == 9].copy()
    w10_sched = sched[sched['week'] == 10].copy()

    # NGS season averages per player
    ngs_season = ngs[ngs['week'] == 0].set_index('player_display_name')

    team_names = {
        'ARI': 'Arizona Cardinals', 'ATL': 'Atlanta Falcons', 'BAL': 'Baltimore Ravens', 'BUF': 'Buffalo Bills',
        'CAR': 'Carolina Panthers', 'CHI': 'Chicago Bears', 'CIN': 'Cincinnati Bengals', 'CLE': 'Cleveland Browns',
        'DAL': 'Dallas Cowboys', 'DEN': 'Denver Broncos', 'DET': 'Detroit Lions', 'GB': 'Green Bay Packers',
        'HOU': 'Houston Texans', 'IND': 'Indianapolis Colts', 'JAX': 'Jacksonville Jaguars', 'KC': 'Kansas City Chiefs',
        'LA': 'Los Angeles Rams', 'LAC': 'Los Angeles Chargers', 'LV': 'Las Vegas Raiders', 'MIA': 'Miami Dolphins',
        'MIN': 'Minnesota Vikings', 'NE': 'New England Patriots', 'NO': 'New Orleans Saints', 'NYG': 'New York Giants',
        'NYJ': 'New York Jets', 'PHI': 'Philadelphia Eagles', 'PIT': 'Pittsburgh Steelers', 'SEA': 'Seattle Seahawks',
        'SF': 'San Francisco 49ers', 'TB': 'Tampa Bay Buccaneers', 'TEN': 'Tennessee Titans', 'WAS': 'Washington Commanders'
    }

    # League baselines
    passes = pbp_reg[pbp_reg['play_type'] == 'pass']
    dbs = pbp_reg[pbp_reg['qb_dropback'] == 1]
    rushes = pbp_reg[pbp_reg['play_type'] == 'run']
    total_plays = len(dbs) + len(rushes)

    lg_sack_rate = dbs['sack'].sum() / len(dbs)
    lg_int_rate = passes['interception'].sum() / len(passes)
    lg_fumb_rate = pbp_reg['fumble_lost'].sum() / total_plays

    # 1. Process weekly points and rolling metrics per team
    records = {}
    for team in sorted(team_names.keys()):
        weekly_scores = []
        weeks_played = []
        row = {'Team': team, 'Offense': f"{team_names[team]} ({team})"}

        for w in range(1, 9):
            w_sched = sched_reg[(sched_reg['week'] == w) & ((sched_reg['home_team'] == team) | (sched_reg['away_team'] == team))]
            if len(w_sched) == 0:
                row[f'W{w}'] = 'BYE'
                continue

            sub_p = pbp_reg[pbp_reg['week'] == w]
            sacks = ((sub_p['posteam'] == team) & (sub_p['sack'] == 1)).sum()
            ints = ((sub_p['posteam'] == team) & (sub_p['interception'] == 1)).sum()
            fumbles = ((sub_p['fumbled_1_team'] == team) & (sub_p['fumble_lost'] == 1)).sum()
            safeties = ((sub_p['posteam'] == team) & (sub_p['safety'] == 1)).sum()
            blocked = ((sub_p['posteam'] == team) & (
                (sub_p['field_goal_result'] == 'blocked') | 
                (sub_p['extra_point_result'] == 'blocked') | 
                (sub_p['punt_blocked'] == 1.0)
            )).sum()
            pick6 = ((sub_p['posteam'] == team) & (sub_p['interception'] == 1) & (sub_p['touchdown'] == 1)).sum()
            fumb_td = ((sub_p['touchdown'] == 1) & (sub_p['td_team'] == sub_p['defteam']) & 
                       (sub_p['desc'].str.contains('FUMBLE', case=False, na=False)) & (sub_p['posteam'] == team)).sum()
            def_td = pick6 + fumb_td

            g = w_sched.iloc[0]
            pts = g['home_score'] if g['home_team'] == team else g['away_score']
            bracket = 10 if pts == 0 else (7 if pts <= 6 else (3 if pts <= 13 else 0))

            w_pts = sacks*1 + ints*1 + fumbles*1 + safeties*2 + blocked*1 + def_td*6 + bracket
            row[f'W{w}'] = w_pts
            weekly_scores.append(w_pts)
            weeks_played.append(w)

        row['Last_2_Games'] = sum(weekly_scores[-2:])
        row['Last_4_Games'] = sum(weekly_scores[-4:])
        row['Total_pts'] = sum(weekly_scores)

        # Advanced dropback & EPA stats over last 4 games played
        last_4_w = weeks_played[-4:]
        sub_off_db = dbs[(dbs['posteam'] == team) & (dbs['week'].isin(last_4_w))]
        sub_off_pass = passes[(passes['posteam'] == team) & (passes['week'].isin(last_4_w))]
        sub_off_all = pbp_reg[(pbp_reg['fumbled_1_team'] == team) & (pbp_reg['week'].isin(last_4_w))]
        sub_runs = pbp_reg[(pbp_reg['posteam'] == team) & (pbp_reg['play_type'] == 'run') & (pbp_reg['week'].isin(last_4_w))]

        sacks_l4 = sub_off_db['sack'].sum()
        hits_l4 = sub_off_db['qb_hit'].sum()
        ints_l4 = sub_off_pass['interception'].sum()
        fumbs_l4 = sub_off_all['fumble_lost'].sum()
        dbs_l4 = len(sub_off_db)
        passes_l4 = len(sub_off_pass)
        plays_l4 = len(pbp_reg[(pbp_reg['posteam'] == team) & (pbp_reg['week'].isin(last_4_w))])

        row['Off_Sack_Rate_L4'] = (sacks_l4 / dbs_l4) if dbs_l4 > 0 else lg_sack_rate
        row['Off_Int_Rate_L4'] = (ints_l4 / passes_l4) if passes_l4 > 0 else lg_int_rate
        row['Off_Fumb_Rate_L4'] = (fumbs_l4 / plays_l4) if plays_l4 > 0 else lg_fumb_rate
        row['Off_Hit_Rate_L4'] = (hits_l4 / dbs_l4) if dbs_l4 > 0 else 0
        row['Off_S_per_P'] = (sacks_l4 / (sacks_l4 + hits_l4)) if (sacks_l4 + hits_l4) > 0 else 0.3
        row['Off_Pass_EPA_L4'] = sub_off_db['epa'].mean() if dbs_l4 > 0 else 0
        row['Off_Rush_EPA_L4'] = sub_runs['epa'].mean() if len(sub_runs) > 0 else 0
        row['Dbs_Per_G_L4'] = dbs_l4 / len(last_4_w)
        row['Passes_Per_G_L4'] = passes_l4 / len(last_4_w)
        row['Plays_Per_G_L4'] = plays_l4 / len(last_4_w)

        # Defense stats (L4)
        def_sub_db = dbs[(dbs['defteam'] == team) & (dbs['week'].isin(last_4_w))]
        def_sub_pass = passes[(passes['defteam'] == team) & (passes['week'].isin(last_4_w))]
        def_sub_all = pbp_reg[(pbp_reg['defteam'] == team) & (pbp_reg['week'].isin(last_4_w))]

        def_sacks_l4 = def_sub_db['sack'].sum()
        def_ints_l4 = def_sub_pass['interception'].sum()
        def_fumbles_l4 = def_sub_all[def_sub_all['fumble_recovery_1_team'] == team]['fumble_lost'].sum()

        def_dbs_l4 = len(def_sub_db)
        def_passes_l4 = len(def_sub_pass)
        def_plays_l4 = len(def_sub_all)

        row['Def_Sack_Rate_L4'] = (def_sacks_l4 / def_dbs_l4) if def_dbs_l4 > 0 else lg_sack_rate
        row['Def_Int_Rate_L4'] = (def_ints_l4 / def_passes_l4) if def_passes_l4 > 0 else lg_int_rate
        row['Def_Fumb_Rate_L4'] = (def_fumbles_l4 / def_plays_l4) if def_plays_l4 > 0 else lg_fumb_rate

        records[team] = row

    # 2. Week 9 Matchups & Vegas Lines
    w9_matchups = {}
    for _, r in w9_sched.iterrows():
        home = r['home_team']
        away = r['away_team']
        total = r['total_line']
        spread = r['spread_line']

        home_imp = (total + spread) / 2
        away_imp = (total - spread) / 2

        w9_matchups[home] = {'dst': away, 'opp_imp': home_imp, 'def_spread': -spread, 'loc': 'home'}
        w9_matchups[away] = {'dst': home, 'opp_imp': away_imp, 'def_spread': spread, 'loc': 'away'}

    # 3. Starting QB information
    qb_details = {
        'ARI': ('Gardner Minshew', 'Yes (Brissett benched)'),
        'ATL': ('Michael Penix Jr.', 'No'),
        'BAL': ('Joe Fagnano', 'Yes (Lamar/Huntley injured)'),
        'BUF': ('Josh Allen', 'No'),
        'CAR': ('Bryce Young', 'No'),
        'CHI': ('Caleb Williams', 'No'),
        'CIN': ('Joe Burrow', 'No'),
        'CLE': ('Shedeur Sanders', 'Yes (Watson concussed)'),
        'DAL': ('Dak Prescott', 'No'),
        'DEN': ('Bo Nix', 'No'),
        'DET': ('Jared Goff', 'No'),
        'GB': ('Jordan Love', 'No'),
        'HOU': ('C.J. Stroud', 'No'),
        'IND': ('Daniel Jones', 'No'),
        'JAX': ('Trevor Lawrence', 'No'),
        'KC': ('Patrick Mahomes', 'No'),
        'LA': ('Matthew Stafford', 'No'),
        'LAC': ('Justin Herbert', 'No'),
        'LV': ('Kirk Cousins', 'No'),
        'MIA': ('Malik Willis', 'No'),
        'MIN': ('Carson Wentz', 'Yes (Murray hamstring)'),
        'NE': ('Drake Maye', 'No'),
        'NO': ('Tyler Shough', 'No'),
        'NYG': ('J.J. McCarthy', 'Yes (Dart injured)'),
        'NYJ': ('Geno Smith', 'No'),
        'PHI': ('Joe Milton III', 'Yes (Hurts on IR)'),
        'PIT': ('Aaron Rodgers', 'BYE'),
        'SEA': ('Drew Lock', 'Yes (Darnold quad/rib)'),
        'SF': ('Brock Purdy', 'No'),
        'TB': ('Baker Mayfield', 'No'),
        'TEN': ('Cam Ward', 'BYE'),
        'WAS': ('Jayden Daniels', 'No')
    }

    def get_ngs(qb_name):
        if qb_name in ngs_season.index:
            r = ngs_season.loc[qb_name]
            return round(r['avg_time_to_throw'], 2), round(r['aggressiveness'], 1)
        matches = [idx for idx in ngs_season.index if any(part in idx for part in qb_name.split()[-2:])]
        if matches:
            r = ngs_season.loc[matches[0]]
            return round(r['avg_time_to_throw'], 2), round(r['aggressiveness'], 1)
        return '-', '-'

    gametime_weather = get_gametime_weather(w9_sched)

    # Current Week Strategic Rationales
    current_rationales = {
        'NO': "Uncontested #1 smash play. Facing Cleveland (NFL-high 41 pts allowed over L4 games) with rookie Shedeur Sanders making his first start in the Superdome behind a Browns offensive line allowing an NFL-worst 10.6% sack rate.",
        'DEN': "High-floor sack monster. Denver's ferocious pass rush faces Bryce Young and a Panthers unit that converts 34.8% of pressures to sacks and surrendered 27 fantasy points over their last 2 games.",
        'HOU': "Elite ceiling play coming off a bye. The Chargers have an NFL-worst -0.365 Pass EPA and are implied for just 18.0 points. Houston is a 4.5-point favorite in a positive defensive game script.",
        'DAL': "Under-the-radar upside play. Indianapolis has surrendered 35 points in their last 4 games (24 in L2), and Daniel Jones remains highly sack-prone (32.9% S/P) under pressure.",
        'JAX': "Thursday Night wet turf smash. Baltimore starts 3rd-string rookie Joe Fagnano in active rain on short rest, with the Ravens implied for a slate-low 14.8 points.",
        'ARI': "Strong opportunistic matchup facing backup Drew Lock (Sam Darnold out). Seattle's offense has surrendered 29 fantasy points over their last 4 games.",
        'NYG': "Vegas darling matchup. Philadelphia is implied for only 17.5 points with Joe Milton III making his first start. Giants front generated high pressure rates over recent weeks.",
        'CIN': "Volume turnover target. Atlanta has yielded an NFL-high 64 fantasy points. Michael Penix Jr. throws into tight windows (21.4% Agg%) and the Falcons offense takes negative plays in bunches.",
        'SEA': "Stifling low-scoring environment. Facing Gardner Minshew and an Arizona offense implied for just 15.5 points in Seattle with 12 mph crosswinds.",
        'TB': "Elite weather-boosted turnover play. Soldier Field features 25 mph wind gusts, while Caleb Williams holds the ball for an NFL-high 3.24s (NGS TTT). This slow release allows TB's pass rush to hit him off-platform into heavy gusts, turning fluttered and sailed balls into high interception risk (TB projects for an NFL-high 2.2 INTs) along with strip-sacks.",
        'CHI': "Favorable game script. Chicago is a 6-point home favorite against Baker Mayfield, who converts 36.8% of his pressures into sacks in gusty lakefront weather.",
        'BUF': "Solid floor vs backup Carson Wentz. Minnesota is without Kyler Murray, lowering their offensive ceiling in a dome environment.",
        'DET': "High variance ceiling play. Miami allows pressure on 44% of dropbacks and Malik Willis holds the ball for 3.05s, though Detroit's secondary carries big-play variance.",
        'NE': "Windy game (29 mph gusts) at home against Green Bay, but Jordan Love gets rid of the ball quickly (2.58s TTT), limiting ceiling.",
        'PHI': "Divisional matchup facing J.J. McCarthy. NY Giants offense has been competitive, making this a secondary streaming option.",
        'KC': "Heavy 10-point home favorite against Geno Smith and the Jets (implied for 18.8 pts), though New York limits major negative turnovers.",
        'SF': "10-point home favorite against Kirk Cousins, but Cousins gets rid of the ball quickly and limits strip-sacks.",
        'WAS': "Tougher spot against Matthew Stafford and a Rams offense that rarely gives up fantasy points to defenses (only 11 pts allowed in L4).",
        'GB': "Facing Drake Maye, who has been highly efficient in recent weeks (+0.422 Pass EPA), capping Green Bay's turnover ceiling.",
        'LAC': "Tough matchup against C.J. Stroud and Houston, who have yielded just 6 points in their last 4 games.",
        'CLE': "Difficult matchup on the road in New Orleans against Tyler Shough, who has protected the ball well.",
        'BAL': "Depleted roster with offensive injuries; Trevor Lawrence has played clean football recently (+0.273 Pass EPA).",
        'MIA': "Tough road test against Jared Goff and a high-powered Detroit offense implied for nearly 29 points.",
        'ATL': "Avoid. Joe Burrow has been red-hot with +0.306 Pass EPA and rarely takes sacks (16.7% S/P).",
        'CAR': "Facing Bo Nix and a Denver offense that has yielded just 6 points over their last 4 games.",
        'IND': "Facing Dak Prescott in a dome with Dallas implied for over 28 points.",
        'MIN': "Facing Josh Allen and Buffalo's high-efficiency offense; low defensive ceiling.",
        'NYJ': "Facing Patrick Mahomes in Kansas City; low turnover floor.",
        'LV': "Facing Brock Purdy and the 49ers off a bye; low fantasy upside.",
        'PIT': "BYE WEEK (None)",
        'TEN': "BYE WEEK (None)"
    }

    # Compile Week 9 Master Table
    master_rows = []
    for team, data in records.items():
        qb_name, backup_flag = qb_details[team]
        ttt, agg = get_ngs(qb_name)
        m_info = w9_matchups.get(team, None)

        if m_info:
            dst = m_info['dst']
            opp_imp = round(float(m_info['opp_imp']), 1)
            def_spread = round(float(m_info['def_spread']), 1)

            # Projections for the target defense facing this offense
            d_m = records[dst]
            
            # 1. Proj Sacks
            exp_sack_rt = (data['Off_Sack_Rate_L4'] * d_m['Def_Sack_Rate_L4']) / lg_sack_rate
            proj_sacks = round(float(data['Dbs_Per_G_L4'] * exp_sack_rt), 1)

            # 2. Proj INTs
            exp_int_rt = (data['Off_Int_Rate_L4'] * d_m['Def_Int_Rate_L4']) / lg_int_rate
            proj_ints = round(float(data['Passes_Per_G_L4'] * exp_int_rt), 1)

            # 3. Proj Fumbles Recovered
            exp_fumb_rt = (data['Off_Fumb_Rate_L4'] * d_m['Def_Fumb_Rate_L4']) / lg_fumb_rate
            proj_fumbles = round(float(data['Plays_Per_G_L4'] * exp_fumb_rt), 1)

            # 4. Bracket Pts
            bracket_pts = round(float(calc_bracket_pts(opp_imp)), 1)

            # 5. Total Proj Pts (including ~8.5% def TD rate & safeties)
            proj_def_td = (proj_ints + proj_fumbles) * 0.085
            proj_total = round(float((proj_sacks * 1.0) + (proj_ints * 1.0) + (proj_fumbles * 1.0) + (proj_def_td * 6.0) + bracket_pts), 1)

            # 6. Predicted Floor
            pred_floor = round(float((proj_sacks * 0.55) + (proj_ints * 0.35) + (bracket_pts * 0.4)), 1)

            target_dst_str = f"{dst} ({'@' if m_info['loc']=='home' else 'vs'} {team})"

            # Tier classification & QB status formatting
            is_backup = 'Yes' in backup_flag
            if is_backup:
                reason = backup_flag.replace('Yes', '').strip(' ()')
                qb_display_status = f"{qb_name} (Backup: {reason})" if reason else f"{qb_name} (Backup)"
            else:
                qb_display_status = f"{qb_name} (Starter)"

            l4_pts = data['Last_4_Games']
            
            if proj_total >= 8.0 or (is_backup and proj_sacks >= 4.0):
                tier = 'Tier 1 (Smash Play)'
            elif proj_total >= 7.0 or is_backup or proj_sacks >= 3.5:
                tier = 'Tier 2 (High Ceiling)'
            elif proj_total >= 6.0 or opp_imp <= 22.0:
                tier = 'Tier 3 (Solid Floor)'
            elif proj_total >= 5.0:
                tier = 'Tier 4 (Deep Sleeper)'
            else:
                tier = 'Tier 5 (Avoid / Tough)'

            rationale = current_rationales.get(dst, "Standard matchup projection.")
        else:
            dst = 'BYE'
            opp_imp = '-'
            def_spread = '-'
            proj_sacks = '-'
            proj_ints = '-'
            proj_fumbles = '-'
            bracket_pts = '-'
            proj_total = '-'
            pred_floor = '-'
            target_dst_str = 'BYE (None)'
            qb_display_status = f"{qb_name} (Starter)"
            tier = 'BYE'
            rationale = "BYE WEEK (None)"

        master_rows.append({
            'Offense': data['Offense'],
            'Team': team,
            'W1': data['W1'], 'W2': data['W2'], 'W3': data['W3'], 'W4': data['W4'],
            'W5': data['W5'], 'W6': data['W6'], 'W7': data['W7'], 'W8': data['W8'],
            'Last_2_Games': data['Last_2_Games'],
            'Last_4_Games': data['Last_4_Games'],
            'Total_pts': data['Total_pts'],
            'Target_DST': target_dst_str,
            'Starting_QB': qb_display_status,
            'Opp_Implied_Pts': opp_imp,
            'Def_Spread': def_spread,
            'Proj_Sacks': proj_sacks,
            'Proj_INTs': proj_ints,
            'Proj_Fumbles': proj_fumbles,
            'Exp_Bracket': bracket_pts,
            'Proj_Fantasy_Pts': proj_total,
            'Predicted_Floor': pred_floor,
            'Sacks_Per_Press%': round(float(data['Off_S_per_P'] * 100), 1),
            'Off_Pass_EPA_L4': round(float(data['Off_Pass_EPA_L4']), 3),
            'NGS_TTT': ttt,
            'NGS_Agg%': agg,
            'Gametime_Weather': gametime_weather.get(team, 'BYE (N/A)'),
            'Streamer_Tier': tier,
            'Current_Week_Rationale': rationale
        })

    df_master = pd.DataFrame(master_rows).sort_values('Total_pts', ascending=False).reset_index(drop=True)
    df_master.to_csv("dst_streaming_targets_week9_2026.csv", index=False)
    
    # Save friendly-named version
    friendly_master_map = {
        'Offense': 'Offense',
        'Team': 'Team Code',
        'W1': 'Week 1', 'W2': 'Week 2', 'W3': 'Week 3', 'W4': 'Week 4',
        'W5': 'Week 5', 'W6': 'Week 6', 'W7': 'Week 7', 'W8': 'Week 8',
        'Last_2_Games': 'Last 2 Games Played',
        'Last_4_Games': 'Last 4 Games Played',
        'Total_pts': 'Total Points Allowed (W1-8)',
        'Target_DST': 'Streaming Defense',
        'Starting_QB': 'Opposing QB (Status)',
        'Opp_Implied_Pts': 'Vegas Implied Opponent Score',
        'Def_Spread': 'Point Spread',
        'Proj_Sacks': 'Projected Sacks',
        'Proj_INTs': 'Projected Interceptions',
        'Proj_Fumbles': 'Projected Fumbles Recovered',
        'Exp_Bracket': 'Projected Points Allowed Bracket',
        'Proj_Fantasy_Pts': 'Projected Fantasy Points',
        'Predicted_Floor': 'Scoring Floor',
        'Sacks_Per_Press%': 'Sack Rate on Pressure %',
        'Off_Pass_EPA_L4': 'Pass Efficiency Allowed (EPA/Play)',
        'NGS_TTT': 'Avg Time to Throw (Sec)',
        'NGS_Agg%': 'Tight-Window Throw %',
        'Gametime_Weather': 'Game-Time Kickoff Weather',
        'Streamer_Tier': 'Streaming Tier',
        'Current_Week_Rationale': 'Strategic Matchup Rationale'
    }
    df_master.rename(columns=friendly_master_map).to_csv("dst_streaming_targets_week9_2026_friendly.csv", index=False)
    print("Saved enriched master table to dst_streaming_targets_week9_2026.csv and dst_streaming_targets_week9_2026_friendly.csv")

    # 4. Generate Week 10 Look-Ahead Stash Board with Rationales
    stash_rationales = {
        'HOU': "Top Week 10 stash. Cleveland has surrendered an NFL-high 41 D/ST points over their last 4 games. Adding Houston now covers Week 9 (@ LAC) and Week 10 (@ CLE).",
        'MIA': "High upside stash. The Colts have surrendered 35 points in their last 4 games and Daniel Jones has absorbed 23 sacks.",
        'NO': "Elite two-week streamer. Plays Cleveland in Week 9 and Carolina (32 pts allowed L4) in Week 10 at home.",
        'LV': "Solid look-ahead play. Seattle has cooled down significantly, allowing 29 fantasy points in their last 4 games.",
        'KC': "Atlanta has yielded 64 fantasy points (#1 in the NFL). Kansas City's disciplined defense gets a great matchup in Week 10.",
        'WAS': "Thursday Night Football advantage against young QB J.J. McCarthy on short rest.",
        'JAX': "Targets rookie Cam Ward and a Titans offense that has given up sacks on over 8% of dropbacks.",
        'GB': "Divisional home game against a banged-up Minnesota backfield. Packers allow -0.200 EPA/pass over recent weeks.",
        'LA': "Faces Gardner Minshew and Arizona's mistake-prone offense in Week 10.",
        'BAL': "Justin Herbert and the Chargers have struggled through the air (-0.365 Pass EPA).",
        'LAC': "Faces Baltimore's backup quarterback situation on Monday Night Football."
    }

    stashes = []
    for _, r in w10_sched.iterrows():
        home = r['home_team']
        away = r['away_team']

        # Home defense facing away offense
        away_l4 = records[away]['Last_4_Games']
        away_tot = records[away]['Total_pts']
        stashes.append({
            'Stash_DST': home,
            'W10_Opponent': f"{away} (vs {away})",
            'Opp_Last_4': away_l4,
            'Opp_Total_Pts': away_tot,
            'Opp_QB': r['away_qb_name'],
            'Look_Ahead_Rationale': stash_rationales.get(home, f"Favorable Week 10 matchup against {away}.")
        })

        # Away defense facing home offense
        home_l4 = records[home]['Last_4_Games']
        home_tot = records[home]['Total_pts']
        stashes.append({
            'Stash_DST': away,
            'W10_Opponent': f"{home} (@ {home})",
            'Opp_Last_4': home_l4,
            'Opp_Total_Pts': home_tot,
            'Opp_QB': r['home_qb_name'],
            'Look_Ahead_Rationale': stash_rationales.get(away, f"Favorable Week 10 matchup against {home}.")
        })

    df_stashes = pd.DataFrame(stashes).sort_values(['Opp_Last_4', 'Opp_Total_Pts'], ascending=False).reset_index(drop=True)
    df_stashes.to_csv("dst_lookahead_week10_2026.csv", index=False)
    
    friendly_stash_map = {
        'Stash_DST': 'Stash Defense',
        'W10_Opponent': 'Week 10 Opponent',
        'Opp_Last_4': 'Opponent L4 Points Allowed',
        'Opp_Total_Pts': 'Opponent Total Points Allowed',
        'Opp_QB': 'Opponent Starting QB',
        'Look_Ahead_Rationale': 'Look-Ahead Strategy Rationale'
    }
    df_stashes.rename(columns=friendly_stash_map).to_csv("dst_lookahead_week10_2026_friendly.csv", index=False)
    print("Saved Week 10 look-ahead stashes to dst_lookahead_week10_2026.csv and dst_lookahead_week10_2026_friendly.csv")

    # 5. Export structured JSON and JS for the dynamic web application
    import json
    from datetime import datetime

    def clean_json(o):
        if isinstance(o, (np.integer, int)):
            return int(o)
        elif isinstance(o, (np.floating, float)):
            val = float(o)
            # EPA gets 3 decimals, everything else gets 1 decimal
            if abs(val) < 1.0 and abs(val) > 0.0001:
                return round(val, 3)
            return round(val, 1)
        elif pd.isna(o):
            return None
        return str(o)

    web_data = {
        'meta': {
            'season': 2026,
            'currentWeek': 9,
            'lookAheadWeek': 10,
            'lastUpdated': datetime.now().strftime('%B %d, %Y at %I:%M %p'),
            'totalOffenses': len(master_rows)
        },
        'weekMatchups': master_rows,
        'historicalOffenses': master_rows,  # contains full W1-W8, L2, L4
        'lookAheadStashes': stashes
    }

    # Save data.json for API/Fetch usage
    with open("data.json", "w") as f:
        json.dump(web_data, f, indent=2, default=clean_json)

    # Save data.js for zero-CORS local Safari viewing (file:// protocol)
    with open("data.js", "w") as f:
        f.write("window.DEFENSE_DATA = " + json.dumps(web_data, indent=2, default=clean_json) + ";\n")

    print("Saved dynamic web data to data.json and data.js")

    return df_master, df_stashes

if __name__ == '__main__':
    main()
