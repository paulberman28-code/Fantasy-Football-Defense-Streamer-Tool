import pandas as pd
import numpy as np
import nfl_data_py as nfl

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

    # Map Week 9 matchups
    matchups = {}
    for _, r in w9_sched.iterrows():
        matchups[r['home_team']] = f"{r['away_team']} (at {r['home_team']})"
        matchups[r['away_team']] = f"{r['home_team']} (vs {r['away_team']})"

    # Week 9 Starting Quarterback status
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
            
            # Sacks (1 pt)
            sacks = ((sub_p['posteam'] == team) & (sub_p['sack'] == 1)).sum()
            
            # Interceptions (1 pt)
            ints = ((sub_p['posteam'] == team) & (sub_p['interception'] == 1)).sum()
            
            # Fumbles Lost (1 pt)
            fumbles = ((sub_p['fumbled_1_team'] == team) & (sub_p['fumble_lost'] == 1)).sum()
            
            # Safeties Allowed (2 pts)
            safeties = ((sub_p['posteam'] == team) & (sub_p['safety'] == 1)).sum()
            
            # Blocked Kicks Allowed (1 pt)
            blocked = ((sub_p['posteam'] == team) & (
                (sub_p['field_goal_result'] == 'blocked') | 
                (sub_p['extra_point_result'] == 'blocked') | 
                (sub_p['punt_blocked'] == 1.0)
            )).sum()
            
            # Defensive TDs Allowed (Pick-6 or Fumble Return TD) (6 pts)
            pick6 = ((sub_p['posteam'] == team) & (sub_p['interception'] == 1) & (sub_p['touchdown'] == 1)).sum()
            fumb_td = ((sub_p['touchdown'] == 1) & (sub_p['td_team'] == sub_p['defteam']) & 
                       (sub_p['desc'].str.contains('FUMBLE', case=False, na=False)) & (sub_p['posteam'] == team)).sum()
            def_td = pick6 + fumb_td
            
            # Points Allowed Brackets
            g = w_sched.iloc[0]
            pts = g['home_score'] if g['home_team'] == team else g['away_score']
            bracket_pts = 10 if pts == 0 else (7 if pts <= 6 else (3 if pts <= 13 else 0))
            
            week_pts = (sacks * 1) + (ints * 1) + (fumbles * 1) + (safeties * 2) + (blocked * 1) + (def_td * 6) + bracket_pts
            row[f'W{w}'] = week_pts
            game_scores.append(week_pts)

        # Rolling Last 4 Games Played (ignoring bye weeks)
        last_4_pts = sum(game_scores[-4:]) if len(game_scores) >= 4 else sum(game_scores)
        last_4_avg = round(last_4_pts / min(len(game_scores), 4), 1)

        row['Last_4_Games'] = last_4_pts
        row['Last_4_Avg'] = last_4_avg
        row['Total_pts'] = sum(game_scores)
        row['Games_Played'] = len(game_scores)
        row['W9_Opponent'] = matchups.get(team, 'BYE (None)')
        row['Backup_QB'] = qb_status[team]
        records.append(row)

    df_out = pd.DataFrame(records).sort_values('Total_pts', ascending=False).reset_index(drop=True)
    df_out.to_csv("dst_streaming_targets_week9_2026.csv", index=False)
    print("Updated data saved to dst_streaming_targets_week9_2026.csv")
    return df_out

if __name__ == '__main__':
    main()
