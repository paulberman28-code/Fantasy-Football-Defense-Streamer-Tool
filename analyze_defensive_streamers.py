import pandas as pd
import numpy as np
import requests
import nfl_data_py as nfl

def get_weather_forecasts(w9_sched):
    """
    Retrieves weather forecast from Open-Meteo for Week 9 outdoor games
    and tags domes/retractable roof stadiums.
    """
    stadium_coords = {
        'BAL': {'name': 'M&T Bank Stadium', 'lat': 39.28, 'lon': -76.62, 'tz': 'America/New_York', 'roof': 'outdoors'},
        'ATL': {'name': 'Bernabeu (Madrid)', 'lat': 40.45, 'lon': -3.69, 'tz': 'Europe/Madrid', 'roof': 'retractable'},
        'CAR': {'name': 'Bank of America Stadium', 'lat': 35.23, 'lon': -80.85, 'tz': 'America/New_York', 'roof': 'outdoors'},
        'IND': {'name': 'Lucas Oil Stadium', 'lat': 39.76, 'lon': -86.16, 'tz': 'America/Indiana/Indianapolis', 'roof': 'dome'},
        'KC': {'name': 'Arrowhead Stadium', 'lat': 39.05, 'lon': -94.48, 'tz': 'America/Chicago', 'roof': 'outdoors'},
        'MIA': {'name': 'Hard Rock Stadium', 'lat': 25.96, 'lon': -80.24, 'tz': 'America/New_York', 'roof': 'outdoors'},
        'NO': {'name': 'Caesars Superdome', 'lat': 29.95, 'lon': -90.08, 'tz': 'America/Chicago', 'roof': 'dome'},
        'PHI': {'name': 'Lincoln Financial Field', 'lat': 39.90, 'lon': -75.17, 'tz': 'America/New_York', 'roof': 'outdoors'},
        'WAS': {'name': 'Northwest Stadium', 'lat': 38.91, 'lon': -76.86, 'tz': 'America/New_York', 'roof': 'outdoors'},
        'LAC': {'name': 'SoFi Stadium', 'lat': 33.95, 'lon': -118.34, 'tz': 'America/Los_Angeles', 'roof': 'dome'},
        'SF': {'name': "Levi's Stadium", 'lat': 37.40, 'lon': -121.97, 'tz': 'America/Los_Angeles', 'roof': 'outdoors'},
        'NE': {'name': 'Gillette Stadium', 'lat': 42.09, 'lon': -71.26, 'tz': 'America/New_York', 'roof': 'outdoors'},
        'SEA': {'name': 'Lumen Field', 'lat': 47.60, 'lon': -122.33, 'tz': 'America/Los_Angeles', 'roof': 'outdoors'},
        'CHI': {'name': 'Soldier Field', 'lat': 41.86, 'lon': -87.62, 'tz': 'America/Chicago', 'roof': 'outdoors'},
        'MIN': {'name': 'U.S. Bank Stadium', 'lat': 44.97, 'lon': -93.26, 'tz': 'America/Chicago', 'roof': 'dome'},
    }

    weather_by_team = {}
    for _, r in w9_sched.iterrows():
        home = r['home_team']
        away = r['away_team']
        date = str(r['gameday'])
        st = stadium_coords.get(home, {})
        
        if st.get('roof') in ['dome', 'retractable']:
            cond = 'Dome (Indoors)'
        else:
            try:
                url = f"https://api.open-meteo.com/v1/forecast?latitude={st['lat']}&longitude={st['lon']}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone={st['tz']}&start_date={date}&end_date={date}"
                res = requests.get(url, timeout=5).json().get('daily', {})
                t_max = res.get('temperature_2m_max', [0])[0]
                t_min = res.get('temperature_2m_min', [0])[0]
                precip = res.get('precipitation_sum', [0])[0]
                snow = res.get('snowfall_sum', [0])[0]
                wind = res.get('wind_speed_10m_max', [0])[0]
                gust = res.get('wind_gusts_10m_max', [0])[0]

                alerts = []
                if gust >= 35:
                    alerts.append(f'Severe Gusts ({gust:.0f} mph)')
                elif gust >= 25 or wind >= 15:
                    alerts.append(f'Windy ({wind:.0f} mph, g{gust:.0f})')
                if snow > 0:
                    alerts.append(f'Snow ({snow:.1f}")')
                elif precip >= 0.25:
                    alerts.append(f'Heavy Rain ({precip:.2f}")')
                elif precip >= 0.05:
                    alerts.append(f'Rain ({precip:.2f}")')
                if t_min <= 32:
                    alerts.append(f'Freezing ({t_min:.0f}°F)')

                cond = ', '.join(alerts) if alerts else f'Fair ({t_max:.0f}°F, {wind:.0f}mph)'
            except Exception:
                cond = 'Outdoor (Forecast Unavailable)'

        weather_by_team[home] = cond
        weather_by_team[away] = cond

    return weather_by_team

def main():
    print("Loading 2026 NFL play-by-play and schedule data...")
    pbp = nfl.import_pbp_data([2026])
    sched = nfl.import_schedules([2026])

    pbp_reg = pbp[(pbp['season_type'] == 'REG') & (pbp['week'] <= 8)].copy()
    sched_reg = sched[(sched['game_type'] == 'REG') & (sched['week'] <= 8)].copy()
    w9_sched = sched[sched['week'] == 9].copy()

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

    matchups = {}
    for _, r in w9_sched.iterrows():
        matchups[r['home_team']] = f"{r['away_team']} (at {r['home_team']})"
        matchups[r['away_team']] = f"{r['home_team']} (vs {r['away_team']})"

    qb_status = {
        'ARI': 'Yes - Gardner Minshew (Jacoby Brissett benched)',
        'ATL': 'No - Michael Penix Jr.',
        'BAL': 'Yes - Joe Fagnano (Lamar Jackson & Tyler Huntley injured)',
        'BUF': 'No - Josh Allen',
        'CAR': 'No - Bryce Young',
        'CHI': 'No - Caleb Williams',
        'CIN': 'No - Joe Burrow',
        'CLE': 'Yes - Shedeur Sanders (Deshaun Watson concussed)',
        'DAL': 'No - Dak Prescott',
        'DEN': 'No - Bo Nix',
        'DET': 'No - Jared Goff',
        'GB': 'No - Jordan Love',
        'HOU': 'No - C.J. Stroud',
        'IND': 'No - Daniel Jones',
        'JAX': 'No - Trevor Lawrence',
        'KC': 'No - Patrick Mahomes',
        'LA': 'No - Matthew Stafford',
        'LAC': 'No - Justin Herbert',
        'LV': 'No - Kirk Cousins',
        'MIA': 'No - Malik Willis',
        'MIN': 'Yes - Carson Wentz (Kyler Murray hamstring)',
        'NE': 'No - Drake Maye',
        'NO': 'No - Tyler Shough',
        'NYG': 'Yes - J.J. McCarthy (acquired replacement for injured Jaxson Dart)',
        'NYJ': 'No - Geno Smith',
        'PHI': 'Yes - Joe Milton III (Jalen Hurts on IR)',
        'PIT': 'BYE (Starter: Aaron Rodgers)',
        'SEA': 'Yes - Drew Lock (Sam Darnold quad/rib)',
        'SF': 'No - Brock Purdy',
        'TB': 'No - Baker Mayfield',
        'TEN': 'BYE (Starter: Cam Ward)',
        'WAS': 'No - Jayden Daniels'
    }

    weather_by_team = get_weather_forecasts(w9_sched)

    teams = sorted(team_names.keys())
    records = []

    for team in teams:
        row = {'Team': team, 'Offense': f"{team_names[team]} ({team})"}
        game_scores = []

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
            bracket_pts = 10 if pts == 0 else (7 if pts <= 6 else (3 if pts <= 13 else 0))
            
            week_pts = (sacks * 1) + (ints * 1) + (fumbles * 1) + (safeties * 2) + (blocked * 1) + (def_td * 6) + bracket_pts
            row[f'W{w}'] = week_pts
            game_scores.append(week_pts)

        # Rolling last 3 and last 4 games played (skipping byes)
        last_3_pts = sum(game_scores[-3:]) if len(game_scores) >= 3 else sum(game_scores)
        last_4_pts = sum(game_scores[-4:]) if len(game_scores) >= 4 else sum(game_scores)

        row['Last_3_Games'] = last_3_pts
        row['Last_4_Games'] = last_4_pts
        row['Total_pts'] = sum(game_scores)
        row['W9_Opponent'] = matchups.get(team, 'BYE (None)')
        row['Weather'] = weather_by_team.get(team, 'BYE (N/A)')
        row['Backup_QB'] = qb_status[team]
        records.append(row)

    df_out = pd.DataFrame(records).sort_values('Total_pts', ascending=False).reset_index(drop=True)
    df_out.to_csv("dst_streaming_targets_week9_2026.csv", index=False)
    print("Updated data saved to dst_streaming_targets_week9_2026.csv")
    return df_out

if __name__ == '__main__':
    main()
