from flask import Flask, render_template, jsonify, request, session, redirect, url_for
import pandas as pd
import math

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = 'your-secret-key-change-this'  # Added secret key for sessions

EXCEL_FILE = 'Updated Site Information Web Interface.xlsx'
SHEET_NAME = 'Data Set'

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
            'Avg_DL_Throughput_Mbps': r.get('Average of DL Average Throughput per User (Mbps')
        }
        if site['Lat'] is not None and site['Lon'] is not None:
            sites.append(site)
    return sites

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
                high = sum(1 for s in rtom_sites if s.get('User_Count') and s.get('User_Count') > 75)
                avg = sum(1 for s in rtom_sites if s.get('User_Count') and 40 <= s.get('User_Count') <= 75)
                low = sum(1 for s in rtom_sites if s.get('User_Count') and s.get('User_Count') < 40)
            
            total = high + avg + low
            stats = {
                rtom_filter: {
                    'high': round((high / total * 100) if total > 0 else 0, 1),
                    'avg': round((avg / total * 100) if total > 0 else 0, 1),
                    'low': round((low / total * 100) if total > 0 else 0, 1),
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
                high = sum(1 for s in region_sites if s.get('User_Count') and s.get('User_Count') > 75)
                avg = sum(1 for s in region_sites if s.get('User_Count') and 40 <= s.get('User_Count') <= 75)
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
                    rtom_high = sum(1 for s in rtom_sites if s.get('User_Count') and s.get('User_Count') > 75)
                    rtom_avg = sum(1 for s in rtom_sites if s.get('User_Count') and 40 <= s.get('User_Count') <= 75)
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
                high = sum(1 for s in region_sites if s.get('User_Count') and s.get('User_Count') > 75)
                avg = sum(1 for s in region_sites if s.get('User_Count') and 40 <= s.get('User_Count') <= 75)
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


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
