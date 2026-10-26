"""
Embed original PDFs as JavaScript base64 data modules.
This guarantees 100% offline access and eliminates all file:/// CORS restrictions in any browser or WebView.
"""
import base64
import os

app_dir = r'C:\Users\Devsass\Desktop\Qisas\app'
assets_dir = os.path.join(app_dir, 'assets')
js_dir = os.path.join(app_dir, 'js')

prophets_pdf = os.path.join(assets_dir, 'Stories_Of_The_Prophets.pdf')
companions_pdf = os.path.join(assets_dir, 'Companions_of_the_Prophet.pdf')

print('Reading Stories of the Prophets PDF...')
with open(prophets_pdf, 'rb') as f:
    p_b64 = base64.b64encode(f.read()).decode('ascii')

prophets_js = os.path.join(js_dir, 'prophets-pdf-data.js')
print(f'Writing {prophets_js} ({len(p_b64)/(1024*1024):.2f} MB)...')
with open(prophets_js, 'w', encoding='utf-8') as f:
    f.write('// Original PDF Data: Stories of the Prophets by Ibn Kathir\n')
    f.write('// Preserved exactly as original source\n')
    f.write('window.PROPHETS_PDF_BASE64 = "')
    f.write(p_b64)
    f.write('";\n')

print('Reading Companions of the Prophet PDF...')
with open(companions_pdf, 'rb') as f:
    c_b64 = base64.b64encode(f.read()).decode('ascii')

companions_js = os.path.join(js_dir, 'companions-pdf-data.js')
print(f'Writing {companions_js} ({len(c_b64)/(1024*1024):.2f} MB)...')
with open(companions_js, 'w', encoding='utf-8') as f:
    f.write('// Original PDF Data: Companions of the Prophet\n')
    f.write('// Preserved exactly as original source\n')
    f.write('window.COMPANIONS_PDF_BASE64 = "')
    f.write(c_b64)
    f.write('";\n')

print('Done embedding PDF data.')
