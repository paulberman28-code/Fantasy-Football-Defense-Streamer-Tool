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

    db = pbp_reg[pbp_reg['qb_dropback'] == 1]
    lg_sack_rate = db['sack'].sum() / len(db)

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
        sub_db = db[(db['posteam'] == team) & (db['week'].isin(last_4_w))]
        sub_runs = pbp_reg[(pbp_reg['posteam'] == team) & (pbp_reg['play_type'] == 'run') & (pbp_reg['week'].isin(last_4_w))]

        sacks_l4 = sub_db['sack'].sum()
        hits_l4 = sub_db['qb_hit'].sum()
        dbs_l4 = len(sub_db)

        row['Off_Sack_Rate_L4'] = (sacks_l4 / dbs_l4) if dbs_l4 > 0 else 0
        row['Off_Hit_Rate_L4'] = (hits_l4 / dbs_l4) if dbs_l4 > 0 else 0
        row['Off_S_per_P'] = (sacks_l4 / (sacks_l4 + hits_l4)) if (sacks_l4 + hits_l4) > 0 else 0.3
        row['Off_Pass_EPA_L4'] = sub_db['epa'].mean() if dbs_l4 > 0 else 0
        row['Off_Rush_EPA_L4'] = sub_runs['epa'].mean() if len(sub_runs) > 0 else 0
        row['Dbs_Per_G_L4'] = dbs_l4 / len(last_4_w)

        def_sub_db = db[(db['defteam'] == team) & (db['week'].isin(last_4_w))]
        def_sacks_l4 = def_sub_db['sack'].sum()
        def_dbs_l4 = len(def_sub_db)
        row['Def_Sack_Rate_L4'] = (def_sacks_l4 / def_dbs_l4) if def_dbs_l4 > 0 else 0

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

    # Compile Week 9 Master Table
    master_rows = []
    for team, data in records.items():
        qb_name, backup_flag = qb_details[team]
        ttt, agg = get_ngs(qb_name)
        m_info = w9_matchups.get(team, None)

        if m_info:
            dst = m_info['dst']
            opp_imp = round(m_info['opp_imp'], 1)
            def_spread = round(m_info['def_spread'], 1)

            # Projected Sacks formula: Expected dropbacks * Matchup sack rate
            d_m = records[dst]
            exp_sack_rt = (data['Off_Sack_Rate_L4'] * d_m['Def_Sack_Rate_L4']) / (lg_sack_rate if lg_sack_rate > 0 else 0.07)
            proj_sacks = round(data['Dbs_Per_G_L4'] * exp_sack_rt, 2)
            target_dst_str = f"{dst} ({'@' if m_info['loc']=='home' else 'vs'} {team})"

            # Tier classification
            is_backup = 'Yes' in backup_flag
            pass_epa = data['Off_Pass_EPA_L4']
            l4_pts = data['Last_4_Games']
            
            if (l4_pts >= 35 or is_backup) and (proj_sacks >= 4.0 or opp_imp <= 20.0):
                tier = 'Tier 1 (Smash Play)'
            elif l4_pts >= 28 or is_backup or proj_sacks >= 3.5:
                tier = 'Tier 2 (High Ceiling)'
            elif l4_pts >= 20 or opp_imp <= 22.0:
                tier = 'Tier 3 (Solid Floor)'
            elif l4_pts >= 14:
                tier = 'Tier 4 (Deep Sleeper)'
            else:
                tier = 'Tier 5 (Avoid / Tough)'
        else:
            dst = 'BYE'
            opp_imp = '-'
            def_spread = '-'
            proj_sacks = '-'
            target_dst_str = 'BYE (None)'
            tier = 'BYE'

        master_rows.append({
            'Offense': data['Offense'],
            'Team': team,
            'W1': data['W1'], 'W2': data['W2'], 'W3': data['W3'], 'W4': data['W4'],
            'W5': data['W5'], 'W6': data['W6'], 'W7': data['W7'], 'W8': data['W8'],
            'Last_2_Games': data['Last_2_Games'],
            'Last_4_Games': data['Last_4_Games'],
            'Total_pts': data['Total_pts'],
            'Target_DST': target_dst_str,
            'Starting_QB': f"{qb_name} ({backup_flag})",
            'Opp_Implied_Pts': opp_imp,
            'Def_Spread': def_spread,
            'Proj_Sacks': proj_sacks,
            'Sacks_Per_Press%': round(data['Off_S_per_P'] * 100, 1),
            'Off_Pass_EPA_L4': round(data['Off_Pass_EPA_L4'], 3),
            'NGS_TTT': ttt,
            'NGS_Agg%': agg,
            'Gametime_Weather': gametime_weather.get(team, 'BYE (N/A)'),
            'Streamer_Tier': tier
        })

    df_master = pd.DataFrame(master_rows).sort_values('Total_pts', ascending=False).reset_index(drop=True)
    df_master.to_csv("dst_streaming_targets_week9_2026.csv", index=False)
    print("Saved enriched master table to dst_streaming_targets_week9_2026.csv")

    # 4. Generate Week 10 Look-Ahead Stash Board
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
            'Opp_QB': r['away_qb_name']
        })

        # Away defense facing home offense
        home_l4 = records[home]['Last_4_Games']
        home_tot = records[home]['Total_pts']
        stashes.append({
            'Stash_DST': away,
            'W10_Opponent': f"{home} (@ {home})",
            'Opp_Last_4': home_l4,
            'Opp_Total_Pts': home_tot,
            'Opp_QB': r['home_qb_name']
        })

    df_stashes = pd.DataFrame(stashes).sort_values(['Opp_Last_4', 'Opp_Total_Pts'], ascending=False).reset_index(drop=True)
    df_stashes.to_csv("dst_lookahead_week10_2026.csv", index=False)
    print("Saved Week 10 look-ahead stashes to dst_lookahead_week10_2026.csv")

    return df_master, df_stashes

if __name__ == '__main__':
    main()
