#!/usr/bin/env python3
"""
Fantasy Football D/ST Historical Audit & Model Reconciler
Analyzes frozen pre-game snapshots against official NFL box scores to compute:
- Mean Absolute Error (MAE)
- Root Mean Squared Error (RMSE)
- Model Bias (directional over/under projection)
- Tier Hit Rates (Priority, Speculative, Avoid)
- Floor Reliability (% beating Predicted Floor)
- Component Error Attribution (Sacks, Turnovers, Points Allowed Brackets)
"""

import os
import sys
import json
import argparse
import numpy as np
import pandas as pd
from datetime import datetime, timezone

try:
    import nfl_data_py as nfl
except ImportError:
    nfl = None

def calculate_bracket_pts(pts_allowed):
    """WAFFLe Points Allowed Bracket Scoring Rules"""
    if pts_allowed is None or pd.isna(pts_allowed):
        return 0.0
    pts = float(pts_allowed)
    if pts == 0:
        return 10.0
    elif 1 <= pts <= 6:
        return 7.0
    elif 7 <= pts <= 13:
        return 3.0
    else:
        return 0.0

def assign_letter_grade(mae, priority_hit_pct, floor_rel_pct):
    """
    Objective Mathematical Grading Scale:
    A / A+: MAE <= 2.8, Priority Hit >= 75%, Floor Rel >= 85%
    A-:     MAE <= 3.2, Priority Hit >= 70%, Floor Rel >= 80%
    B+:     MAE <= 3.5, Priority Hit >= 60%, Floor Rel >= 75%
    B:      MAE <= 3.8, Priority Hit >= 50%, Floor Rel >= 70%
    C:      MAE <= 4.2
    D/F:    MAE > 4.2
    """
    if mae <= 2.8 and priority_hit_pct >= 75.0 and floor_rel_pct >= 85.0:
        return "A"
    elif mae <= 3.2 and priority_hit_pct >= 70.0 and floor_rel_pct >= 80.0:
        return "A-"
    elif mae <= 3.5 and priority_hit_pct >= 60.0 and floor_rel_pct >= 75.0:
        return "B+"
    elif mae <= 3.8 and priority_hit_pct >= 50.0:
        return "B"
    elif mae <= 4.2:
        return "C"
    else:
        return "D"

def reconcile_week(week, season=2026, snapshot_path=None, allow_partial=False):
    if snapshot_path is None:
        snapshot_path = f"snapshots/week_{week:02d}_{season}_snapshot.json"

    if not os.path.exists(snapshot_path):
        print(f"Error: Snapshot file not found at {snapshot_path}")
        return False

    with open(snapshot_path, "r") as f:
        snapshot = json.load(f)

    meta = snapshot.get("metadata", {})
    published = snapshot.get("published_projections", [])
    raw_store = snapshot.get("raw_feature_store", {})

    print(f"Loaded snapshot {meta.get('snapshot_id')} (Git: {meta.get('git_commit_hash', 'unknown')[:8]}, SHA256: {meta.get('sha256', '')[:12]}...)")

    if nfl is None:
        print("Error: nfl_data_py is required to fetch official box scores.")
        return False

    print(f"Fetching official NFL play-by-play and box scores for {season} Week {week}...")
    try:
        pbp = nfl.import_pbp_data([season])
        sched = nfl.import_schedules([season])
    except Exception as e:
        print(f"Error downloading NFL data: {e}")
        return False

    w_pbp = pbp[(pbp['season_type'] == 'REG') & (pbp['week'] == week)].copy()
    w_sched = sched[(sched['game_type'] == 'REG') & (sched['week'] == week)].copy()

    completed_games = w_sched[w_sched['home_score'].notna() & w_sched['away_score'].notna()]
    total_games = len(w_sched)

    if len(completed_games) == 0:
        print(f"Notice: Week {week} games have not started yet. Status remains LOCKED PRE-GAME.")
        return False

    is_final = len(completed_games) >= total_games
    if not is_final and not allow_partial:
        print(f"Notice: Week {week} is currently in progress ({len(completed_games)} of {total_games} games finished).")
        print("To protect data integrity, final weekly grades and MAE are calculated once all matchups conclude post-MNF.")
        print("To audit only the in-progress completed games, run with --allow-partial.")
        return False

    print(f"Found {len(completed_games)} completed games ({len(w_pbp)} plays). Calculating actual D/ST box score fantasy points...")

    # Build actual scores per defense under WAFFLe rules for completed games only
    actuals = {}
    for _, game in completed_games.iterrows():
        home = game['home_team']
        away = game['away_team']
        home_score = float(game['home_score'])
        away_score = float(game['away_score'])

        # Defenses
        # Home defense faces away offense -> points allowed = away_score
        # Away defense faces home offense -> points allowed = home_score
        for dst, opp, pts_allowed in [(home, away, away_score), (away, home, home_score)]:
            dst_pbp = w_pbp[w_pbp['defteam'] == dst]
            
            sacks = int(dst_pbp['sack'].sum()) if 'sack' in dst_pbp else 0
            ints = int(dst_pbp['interception'].sum()) if 'interception' in dst_pbp else 0
            
            # Fumbles recovered
            if 'fumble_lost' in dst_pbp and 'fumble_recovery_1_team' in dst_pbp:
                fumbles = int(dst_pbp[(dst_pbp['fumble_recovery_1_team'] == dst) & (dst_pbp['fumble_lost'] == 1)].shape[0])
            else:
                fumbles = 0

            # Defensive & Special Teams Touchdowns (6 pts)
            def_tds = 0
            if 'return_touchdown' in dst_pbp:
                def_tds += int(dst_pbp['return_touchdown'].sum())
            if 'defteam_score_post' in dst_pbp and 'defteam_score' in dst_pbp:
                score_diff = dst_pbp['defteam_score_post'] - dst_pbp['defteam_score']
                td_events = (score_diff == 6).sum()
                if td_events > def_tds:
                    def_tds = int(td_events)

            # Safeties (2 pts)
            safeties = int(dst_pbp['safety'].sum()) if 'safety' in dst_pbp else 0

            # Blocked kicks (1 pt)
            blocks = 0
            if 'blocked_player_id' in dst_pbp:
                blocks = int(dst_pbp['blocked_player_id'].notna().sum())

            # Bracket points
            bracket_pts = calculate_bracket_pts(pts_allowed)

            total_actual_pts = round(
                (sacks * 1.0) +
                (ints * 1.0) +
                (fumbles * 1.0) +
                (def_tds * 6.0) +
                (safeties * 2.0) +
                (blocks * 1.0) +
                bracket_pts,
                1
            )

            actuals[dst] = {
                'dst': dst,
                'opp': opp,
                'pts_allowed': pts_allowed,
                'actual_sacks': sacks,
                'actual_ints': ints,
                'actual_fumbles': fumbles,
                'actual_to': ints + fumbles,
                'actual_tds': def_tds,
                'actual_safeties': safeties,
                'actual_blocks': blocks,
                'actual_bracket': bracket_pts,
                'actual_fantasy_pts': total_actual_pts
            }

    # Reconcile against snapshot projections
    reconciliation_rows = []
    for p in published:
        target_str = p.get('Target_DST', '')
        if not target_str or 'BYE' in target_str:
            continue
        dst_code = target_str.split(' ')[0]
        act = actuals.get(dst_code)
        if not act:
            continue

        proj_pts = float(p.get('Proj_Fantasy_Pts', 0))
        pred_floor = float(p.get('Predicted_Floor', 0))
        tier = p.get('Streamer_Tier', 'Neutral')
        actual_pts = act['actual_fantasy_pts']

        error_diff = round(actual_pts - proj_pts, 1)
        abs_error = round(abs(error_diff), 1)
        floor_met = bool(actual_pts >= pred_floor)

        # Hit evaluation:
        # Priority/Speculative hits if actual >= 7.0 or beat projected
        # Avoid hits if defense stayed <= 5.0 (trap successfully avoided)
        if tier in ['Priority', 'Speculative']:
            hit = bool(actual_pts >= 7.0 or error_diff >= 0.0)
        elif tier == 'Avoid':
            hit = bool(actual_pts <= 5.0)
        else:
            hit = bool(actual_pts >= 5.0)

        proj_sacks = float(p.get('Proj_Sacks', 0))
        proj_to = round(float(p.get('Proj_INTs', 0)) + float(p.get('Proj_Fumbles', 0)), 1)
        proj_bracket = float(p.get('Exp_Bracket', 0))

        reconciliation_rows.append({
            'dst': dst_code,
            'opp': act['opp'],
            'tier': tier,
            'proj_pts': proj_pts,
            'actual_pts': actual_pts,
            'error_diff': error_diff,
            'abs_error': abs_error,
            'floor': pred_floor,
            'floor_met': floor_met,
            'proj_sacks': proj_sacks,
            'actual_sacks': act['actual_sacks'],
            'proj_to': proj_to,
            'actual_to': act['actual_to'],
            'proj_bracket': proj_bracket,
            'actual_bracket': act['actual_bracket'],
            'hit': hit
        })

    if not reconciliation_rows:
        print("Error: No matching defenses found between snapshot and game results.")
        return False

    df_rec = pd.DataFrame(reconciliation_rows)

    # Calculate overall accuracy KPIs
    mae = round(float(df_rec['abs_error'].mean()), 2)
    rmse = round(float(np.sqrt((df_rec['error_diff'] ** 2).mean())), 2)
    model_bias = round(float(df_rec['error_diff'].mean()), 2)
    floor_reliability = round(float(df_rec['floor_met'].mean() * 100), 1)

    # Tier breakdowns
    tier_stats = []
    for t_name in ['Priority', 'Speculative', 'Neutral', 'Avoid']:
        sub = df_rec[df_rec['tier'] == t_name]
        if len(sub) > 0:
            t_hit = round(float(sub['hit'].mean() * 100), 1)
            t_proj = round(float(sub['proj_pts'].mean()), 1)
            t_act = round(float(sub['actual_pts'].mean()), 1)
            tier_stats.append({
                'tier': t_name,
                'count': len(sub),
                'avg_proj': t_proj,
                'avg_actual': t_act,
                'hit_rate': t_hit
            })

    priority_sub = df_rec[df_rec['tier'] == 'Priority']
    priority_hit_pct = round(float(priority_sub['hit'].mean() * 100), 1) if len(priority_sub) > 0 else 0.0
    priority_avg_proj = round(float(priority_sub['proj_pts'].mean()), 1) if len(priority_sub) > 0 else 0.0
    priority_avg_actual = round(float(priority_sub['actual_pts'].mean()), 1) if len(priority_sub) > 0 else 0.0
    priority_teams = ", ".join(priority_sub['dst'].tolist())

    letter_grade = assign_letter_grade(mae, priority_hit_pct, floor_reliability)

    audit_result = {
        'week': week,
        'season': season,
        'status': 'COMPLETED',
        'audit_timestamp_utc': datetime.now(timezone.utc).isoformat(),
        'snapshot_id': meta.get('snapshot_id'),
        'snapshot_sha256': meta.get('sha256'),
        'summary': {
            'total_matchups': len(df_rec),
            'mae': mae,
            'rmse': rmse,
            'model_bias': model_bias,
            'floor_reliability_pct': floor_reliability,
            'priority_hit_rate_pct': priority_hit_pct,
            'priority_avg_proj': priority_avg_proj,
            'priority_avg_actual': priority_avg_actual,
            'priority_teams': priority_teams,
            'weekly_letter_grade': letter_grade
        },
        'tier_breakdown': tier_stats,
        'matchup_reconciliation': reconciliation_rows
    }

    os.makedirs("audits", exist_ok=True)
    audit_file = f"audits/week_{week:02d}_audit.json"
    with open(audit_file, "w") as f:
        json.dump(audit_result, f, indent=2)

    print(f"Saved reconciled audit report to {audit_file} (MAE: {mae} pts, Grade: {letter_grade})")

    # Update web data.json and data.js
    if os.path.exists("data.json"):
        with open("data.json", "r") as f:
            web_data = json.load(f)

        if "audit" not in web_data:
            web_data["audit"] = {}

        completed = web_data["audit"].get("completedAudits", [])
        # Update or append
        completed = [c for c in completed if c.get('week') != week]
        completed.append(audit_result)
        web_data["audit"]["completedAudits"] = completed

        with open("data.json", "w") as f:
            json.dump(web_data, f, indent=2)

        with open("data.js", "w") as f:
            f.write("window.DEFENSE_DATA = " + json.dumps(web_data, indent=2) + ";\n")

        print("Updated data.json and data.js with completed audit results.")

    return True

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Reconcile and audit fantasy D/ST weekly projections against official NFL box scores.")
    parser.add_argument("--week", type=int, default=9, help="NFL Regular Season Week to audit (default: 9)")
    parser.add_argument("--season", type=int, default=2026, help="NFL Season (default: 2026)")
    parser.add_argument("--snapshot", type=str, default=None, help="Path to immutable snapshot JSON")
    parser.add_argument("--allow-partial", action="store_true", help="Allow partial reconciliation of completed games while week is in progress")

    args = parser.parse_args()
    reconcile_week(args.week, args.season, args.snapshot, args.allow_partial)
