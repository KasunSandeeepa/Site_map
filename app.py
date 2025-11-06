from flask import Flask, render_template, jsonify, request, session, redirect, url_for
import pandas as pd
import math

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = 'your-secret-key-change-this'  # Added secret key for sessions

EXCEL_FILE = 'Updated Site Information Web Interface.xlsx'
SHEET_NAME = 'Data Set'
TREND_TRAFFIC_SHEET = 'Trend Traffic Data'
TREND_USER_SHEET = 'Trend User Count'

ADMIN_CREDENTIALS = {
    'admin': {'password': 'admin123', 'role': 'super_admin', 'region': None},
    'metro_admin': {'password': 'metro123', 'role': 'region_admin', 'region': 'Metro'},
    'region1_admin': {'password': 'region1_123', 'role': 'region_admin', 'region': 'Region 1'},
    'region2_admin': {'password': 'region2_123', 'role': 'region_admin', 'region': 'Region 2'},
    'region3_admin': {'password': 'region3_123', 'role': 'region_admin', 'region': 'Region 3'},
}

def canonicalize_columns(df):
    # Remove leading/trailing spaces and non-breaking spaces
    df.columns = [str(c).replace('\xa0',' ').strip() for c in df.columns]
    return df

def load_sites():
    df = pd.read_excel(EXCEL_FILE, sheet_name=SHEET_NAME, engine='openpyxl')
    df = canonicalize_columns(df)

    # Convert numeric columns
    numeric_cols = ['Lat','Lon','Monthly Traffic DL (GB)','Monthly Traffic UL (GB)',
                    'Monthly Traffic Total (GB)','User_Count','Average of DL Average Throughput per User (Mbps)']
    for c in numeric_cols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors='coerce')

    sites = []
    for _, r in df.iterrows():
        total_gb = r.get('Monthly Traffic Total (GB)')
        total_tb = float(total_gb)/1024 if total_gb else None

        site = {
            'eNodeB_ID': r.get('eNodeB ID'),
            'eNodeB_Name': r.get('eNodeB Name'),
            'District': r.get('District'),
            'Lat': r.get('Lat'),
            'Lon': r.get('Lon'),
            'Sales_Region': r.get('Sales Region'),
            'RTO': r.get('RTO'),
            'RTOM': r.get('RTOM'),
            'Monthly_Traffic_DL_GB': r.get('Monthly Traffic DL (GB)'),
            'Monthly_Traffic_UL_GB': r.get('Monthly Traffic UL (GB)'),
            'Monthly_Traffic_Total_GB': total_gb,
            'Monthly_Traffic_Total_TB': total_tb,
            'Bandwidth': r.get('Bandwidth'),   # trailing space removed
            'User_Count': r.get('User_Count'),
            'Avg_DL_Throughput_Mbps': r.get('Average of DL Average Throughput per User (Mbps)')  # fixed missing closing parenthesis in column name
        }
        if site['Lat'] is not None and site['Lon'] is not None:
            sites.append(site)
    return sites

def load_trend_data():
    """Load trend data from Excel sheets"""
    trend_data = {}
    
    try:
        # Load Traffic Data
        traffic_df = pd.read_excel(EXCEL_FILE, sheet_name=TREND_TRAFFIC_SHEET, engine='openpyxl')
        traffic_df = canonicalize_columns(traffic_df)
        print("[v0] ===== TRAFFIC SHEET DEBUG =====")
        print("[v0] All columns:", list(traffic_df.columns))
        print("[v0] First few rows:")
        print(traffic_df.head())
        
        # Find month columns - be more flexible with matching
        month_columns = [col for col in traffic_df.columns 
                        if col not in ['eNodeB ID', 'eNodeB Name', 'Site Name', 'Site ID']
                        and not pd.isna(col)
                        and str(col).strip() != '']
        
        # Filter to only numeric columns (exclude non-numeric data columns)
        month_columns = [col for col in month_columns 
                        if traffic_df[col].dtype in ['int64', 'float64'] or 
                        pd.to_numeric(traffic_df[col], errors='coerce').notna().any()]
        
        print(f"[v0] Found {len(month_columns)} month columns: {month_columns[:5]}...")
        
        for idx, row in traffic_df.iterrows():
            node_id = row.get('eNodeB ID')
            if pd.isna(node_id):
                continue
            
            # Normalize ID - convert to string, handle both int and string IDs
            try:
                node_id_str = str(int(float(node_id))).strip()
            except (ValueError, TypeError):
                node_id_str = str(node_id).strip()
            
            if node_id_str not in trend_data:
                trend_data[node_id_str] = {'traffic': {}, 'users': {}}
            
            for month in month_columns:
                value = row.get(month)
                if pd.notna(value):
                    try:
                        num_val = float(value)
                        if num_val > 0:  # Only store positive values
                            trend_data[node_id_str]['traffic'][month] = int(num_val) if num_val == int(num_val) else num_val
                    except (ValueError, TypeError):
                        pass
        
        traffic_with_data = sum(1 for n in trend_data if len(trend_data[n]['traffic']) > 0)
        print(f"[v0] Traffic: {traffic_with_data} nodes with data")
        if traffic_with_data > 0:
            sample_id = next(n for n in trend_data if len(trend_data[n]['traffic']) > 0)
            print(f"[v0] Sample traffic data for ID {sample_id}: {trend_data[sample_id]['traffic']}")
        
        # Load User Data
        user_df = pd.read_excel(EXCEL_FILE, sheet_name=TREND_USER_SHEET, engine='openpyxl')
        user_df = canonicalize_columns(user_df)
        print("[v0] ===== USER SHEET DEBUG =====")
        print("[v0] All columns:", list(user_df.columns))
        print("[v0] First few rows:")
        print(user_df.head())
        
        # Find week columns - be more flexible
        week_columns = [col for col in user_df.columns 
                       if col not in ['eNodeB ID', 'eNodeB Name', 'Site Name', 'Site ID']
                       and not pd.isna(col)
                       and str(col).strip() != '']
        
        # Filter to only numeric columns
        week_columns = [col for col in week_columns 
                       if user_df[col].dtype in ['int64', 'float64'] or 
                       pd.to_numeric(user_df[col], errors='coerce').notna().any()]
        
        print(f"[v0] Found {len(week_columns)} week columns: {week_columns[:5]}...")
        
        for idx, row in user_df.iterrows():
            node_id = row.get('eNodeB ID')
            if pd.isna(node_id):
                continue
            
            # Normalize ID
            try:
                node_id_str = str(int(float(node_id))).strip()
            except (ValueError, TypeError):
                node_id_str = str(node_id).strip()
            
            if node_id_str not in trend_data:
                trend_data[node_id_str] = {'traffic': {}, 'users': {}}
            
            for week in week_columns:
                value = row.get(week)
                if pd.notna(value):
                    try:
                        num_val = float(value)
                        if num_val > 0:  # Only store positive values
                            trend_data[node_id_str]['users'][week] = int(num_val) if num_val == int(num_val) else num_val
                    except (ValueError, TypeError):
                        pass
        
        users_with_data = sum(1 for n in trend_data if len(trend_data[n]['users']) > 0)
        print(f"[v0] User: {users_with_data} nodes with data")
        if users_with_data > 0:
            sample_id = next(n for n in trend_data if len(trend_data[n]['users']) > 0)
            print(f"[v0] Sample user data for ID {sample_id}: {trend_data[sample_id]['users']}")
        
        print(f"[v0] ===== FINAL: {len(trend_data)} total nodes in cache =====")
        
    except Exception as e:
        print(f"[v0] ERROR in load_trend_data: {e}")
        import traceback
        traceback.print_exc()
    
    return trend_data


# Cache trend data
trend_data_cache = load_trend_data()

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()
        
        if username in ADMIN_CREDENTIALS and ADMIN_CREDENTIALS[username]['password'] == password:
            session['username'] = username
            session['role'] = ADMIN_CREDENTIALS[username]['role']
            session['region'] = ADMIN_CREDENTIALS[username]['region']
            return redirect(url_for('index'))
        else:
            return render_template('login.html', error='Invalid username or password')
    
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/')
def index():
    if 'username' not in session:
        return redirect(url_for('login'))
    return render_template('index.html')

@app.route('/get_admin_info')
def get_admin_info():
    if 'username' not in session:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
    
    return jsonify({
        'success': True,
        'username': session.get('username'),
        'role': session.get('role'),
        'region': session.get('region')
    })

@app.route('/get_sites')
def get_sites():
    if 'username' not in session:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
    
    try:
        sites = load_sites()
        return jsonify({'success': True, 'sites': sites})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    
@app.route('/get_cities')
def get_cities():
    if 'username' not in session:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
    
    try:
        sites = load_sites()
        cities = sorted(list(set([site.get('RTOM') for site in sites if site.get('RTOM')])))
        return jsonify({'success': True, 'cities': cities})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    
@app.route('/get_utility_stats')
def get_utility_stats():
    if 'username' not in session:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
    
    try:
        sites = load_sites()
        region_filter = request.args.get('region', 'All')
        rtom_filter = request.args.get('rtom', 'All')
        metric = request.args.get('metric', 'traffic')
        
        if rtom_filter != 'All':
            rtom_sites = [s for s in sites if (s.get('RTOM') or '').strip() == rtom_filter]
            
            if metric == 'traffic':
                high = sum(1 for s in rtom_sites if s.get('Monthly_Traffic_Total_TB') and s.get('Monthly_Traffic_Total_TB') > 4)
                avg = sum(1 for s in rtom_sites if s.get('Monthly_Traffic_Total_TB') and 2 <= s.get('Monthly_Traffic_Total_TB') <= 4)
                low = sum(1 for s in rtom_sites if s.get('Monthly_Traffic_Total_TB') and s.get('Monthly_Traffic_Total_TB') < 2)
            else:
                high = sum(1 for s in rtom_sites if s.get('User_Count') and s.get('User_Count') > 80)
                avg = sum(1 for s in rtom_sites if s.get('User_Count') and 40 <= s.get('User_Count') <= 80)
                low = sum(1 for s in rtom_sites if s.get('User_Count') and s.get('User_Count') < 40)
            
            total = high + avg + low
            
            stats = {
                rtom_filter: {
                    'high': round((high / total * 100) if total > 0 else 0, 1),
                    'avg': round((avg / total * 100) if total > 0 else 0, 1),
                    'low': round((low / total * 100) if total > 0 else 0, 1),
                    'total_sites': total
                }
            }
            return jsonify({'success': True, 'regions': [rtom_filter], 'stats': stats, 'is_rtom': True, 'rtom_breakdown': None})
        
        if region_filter != 'All':
            region_sites = [s for s in sites if (s.get('Sales_Region') or '').strip() == region_filter]
            
            if metric == 'traffic':
                high = sum(1 for s in region_sites if s.get('Monthly_Traffic_Total_TB') and s.get('Monthly_Traffic_Total_TB') > 4)
                avg = sum(1 for s in region_sites if s.get('Monthly_Traffic_Total_TB') and 2 <= s.get('Monthly_Traffic_Total_TB') <= 4)
                low = sum(1 for s in region_sites if s.get('Monthly_Traffic_Total_TB') and s.get('Monthly_Traffic_Total_TB') < 2)
            else:
                high = sum(1 for s in region_sites if s.get('User_Count') and s.get('User_Count') > 80)
                avg = sum(1 for s in region_sites if s.get('User_Count') and 40 <= s.get('User_Count') <= 80)
                low = sum(1 for s in region_sites if s.get('User_Count') and s.get('User_Count') < 40)
            
            total = high + avg + low
            stats = {
                region_filter: {
                    'high': round((high / total * 100) if total > 0 else 0, 1),
                    'avg': round((avg / total * 100) if total > 0 else 0, 1),
                    'low': round((low / total * 100) if total > 0 else 0, 1),
                }
            }
            
            rtoms_in_region = sorted(list(set([s.get('RTOM') for s in region_sites if s.get('RTOM')])))
            rtom_breakdown = {}
            
            for rtom in rtoms_in_region:
                rtom_sites = [s for s in region_sites if (s.get('RTOM') or '').strip() == rtom]
                
                if metric == 'traffic':
                    rtom_high = sum(1 for s in rtom_sites if s.get('Monthly_Traffic_Total_TB') and s.get('Monthly_Traffic_Total_TB') > 4)
                    rtom_avg = sum(1 for s in rtom_sites if s.get('Monthly_Traffic_Total_TB') and 2 <= s.get('Monthly_Traffic_Total_TB') <= 4)
                    rtom_low = sum(1 for s in rtom_sites if s.get('Monthly_Traffic_Total_TB') and s.get('Monthly_Traffic_Total_TB') < 2)
                else:
                    rtom_high = sum(1 for s in rtom_sites if s.get('User_Count') and s.get('User_Count') > 80)
                    rtom_avg = sum(1 for s in rtom_sites if s.get('User_Count') and 40 <= s.get('User_Count') <= 80)
                    rtom_low = sum(1 for s in rtom_sites if s.get('User_Count') and s.get('User_Count') < 40)
                
                rtom_total = rtom_high + rtom_avg + rtom_low
                rtom_breakdown[rtom] = {
                    'high': round((rtom_high / rtom_total * 100) if rtom_total > 0 else 0, 1),
                    'avg': round((rtom_avg / rtom_total * 100) if rtom_total > 0 else 0, 1),
                    'low': round((rtom_low / rtom_total * 100) if rtom_total > 0 else 0, 1),
                }
            
            return jsonify({'success': True, 'regions': [region_filter], 'stats': stats, 'is_rtom': False, 'rtom_breakdown': rtom_breakdown})
        
        all_regions = sorted(list(set([s.get('Sales_Region') for s in sites if s.get('Sales_Region')])))

        stats = {}
        for region in all_regions:
            region_sites = [s for s in sites if (s.get('Sales_Region') or '').strip() == region]
            
            if metric == 'traffic':
                high = sum(1 for s in region_sites if s.get('Monthly_Traffic_Total_TB') and s.get('Monthly_Traffic_Total_TB') > 4)
                avg = sum(1 for s in region_sites if s.get('Monthly_Traffic_Total_TB') and 2 <= s.get('Monthly_Traffic_Total_TB') <= 4)
                low = sum(1 for s in region_sites if s.get('Monthly_Traffic_Total_TB') and s.get('Monthly_Traffic_Total_TB') < 2)
            else:
                high = sum(1 for s in region_sites if s.get('User_Count') and s.get('User_Count') > 80)
                avg = sum(1 for s in region_sites if s.get('User_Count') and 40 <= s.get('User_Count') <= 80)
                low = sum(1 for s in region_sites if s.get('User_Count') and s.get('User_Count') < 40)
            
            total = high + avg + low
            
            stats[region] = {
                'high': round((high / total * 100) if total > 0 else 0, 1),
                'avg': round((avg / total * 100) if total > 0 else 0, 1),
                'low': round((low / total * 100) if total > 0 else 0, 1),
            }
        
        return jsonify({'success': True, 'regions': all_regions, 'stats': stats, 'is_rtom': False, 'rtom_breakdown': None})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/get_site_trends/<site_id>')
def get_site_trends(site_id):
    if 'username' not in session:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
    
    try:
        # Normalize the ID to match how it's stored in the cache
        try:
            site_id_lookup = str(int(float(site_id))).strip()
        except (ValueError, TypeError):
            site_id_lookup = str(site_id).strip()
        
        print(f"[v0] Trend lookup for site_id={site_id}, normalized={site_id_lookup}")
        print(f"[v0] Available keys sample: {list(trend_data_cache.keys())[:10]}")
        
        # Check if ID exists in cache
        if site_id_lookup not in trend_data_cache:
            print(f"[v0] ID {site_id_lookup} not found in cache")
            return jsonify({
                'success': False,
                'error': f'No trend data available for site {site_id}'
            })
        
        trend_info = trend_data_cache.get(site_id_lookup, {'traffic': {}, 'users': {}})
        
        print(f"[v0] Found traffic points: {len(trend_info['traffic'])}, user points: {len(trend_info['users'])}")
        
        traffic_trend = [
            {'period': period, 'value': value} 
            for period, value in sorted(trend_info['traffic'].items())
        ]
        user_trend = [
            {'period': period, 'value': value} 
            for period, value in sorted(trend_info['users'].items())
        ]
        
        return jsonify({
            'success': True,
            'traffic_trend': traffic_trend,
            'user_trend': user_trend
        })
    except Exception as e:
        print(f"[v0] ERROR in get_site_trends: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
