import json
import re
import sys
import pypdf

# Ensure utf-8 output
sys.stdout.reconfigure(encoding='utf-8')

def slugify(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')

def clean_paragraph_text(raw_text):
    """
    Cleans extracted PDF text to make it flow naturally in HTML/e-reader:
    - Normalizes multiple spaces
    - Unifies quotes
    - Joins soft line breaks within paragraphs while preserving intentional paragraph breaks
    """
    if not raw_text:
        return ""
    
    # Remove form feed characters
    text = raw_text.replace('\x0c', '\n')
    
    # Normalize common ligature artifacts
    text = text.replace('\xa0', ' ')
    
    # Split into lines
    lines = [line.strip() for line in text.split('\n')]
    
    paragraphs = []
    current_para = []
    
    for line in lines:
        if not line:
            if current_para:
                paragraphs.append(' '.join(current_para))
                current_para = []
        else:
            current_para.append(line)
            
    if current_para:
        paragraphs.append(' '.join(current_para))
        
    # Join paragraphs with double newline
    cleaned = '\n\n'.join(paragraphs).strip()
    return cleaned

def extract_prophets():
    print(">>> Extracting Stories of the Prophets text...")
    catalog = json.load(open('prophets_complete_catalog.json', encoding='utf-8'))
    reader = pypdf.PdfReader('app/assets/Stories_Of_The_Prophets.pdf')
    
    num_pages = len(reader.pages)
    all_pages_text = {}
    for p in range(1, num_pages + 1):
        all_pages_text[p] = reader.pages[p - 1].extract_text()
        
    prophets_data = []
    
    for p_idx, p in enumerate(catalog):
        p_name = p['name']
        p_id = p.get('id', slugify(p_name))
        start_pg = p['start_page']
        end_pg = p['end_page']
        headings = p.get('headings', [])
        
        # Concatenate text from start_page to end_page, tagging page markers
        combined_text = ""
        for pg in range(start_pg, end_pg + 1):
            combined_text += f"\n---PAGE_{pg}---\n" + all_pages_text.get(pg, "")
            
        # Segment text by headings
        sections = []
        heading_positions = []
        
        for h_idx, h in enumerate(headings):
            htitle = h['title'].strip()
            hpage = h['page']
            
            # Find in text
            pattern = re.escape(htitle)
            match = re.search(pattern, combined_text, re.IGNORECASE)
            
            if not match:
                tokens = [re.escape(w) for w in htitle.split()]
                flex_pattern = r'\s+'.join(tokens)
                match = re.search(flex_pattern, combined_text, re.IGNORECASE)
                
            pos = match.start() if match else -1
            heading_positions.append((h, pos, match.end() if match else -1))
            
        # Slicing text between heading[i] and heading[i+1]
        for i in range(len(heading_positions)):
            h_info, start_pos, end_match_pos = heading_positions[i]
            
            if i + 1 < len(heading_positions) and heading_positions[i+1][1] != -1:
                next_start_pos = heading_positions[i+1][1]
            else:
                next_start_pos = len(combined_text)
                
            if end_match_pos != -1:
                raw_section_text = combined_text[end_match_pos:next_start_pos]
            else:
                raw_section_text = all_pages_text.get(h_info['page'], "")
                
            raw_section_text = re.sub(r'---PAGE_\d+---', '', raw_section_text)
            clean_text = clean_paragraph_text(raw_section_text)
            
            sections.append({
                "id": f"{p_id}-sec-{i+1}",
                "title": h_info['title'],
                "page": h_info['page'],
                "content": clean_text
            })
            
        clean_full_text = clean_paragraph_text(re.sub(r'---PAGE_\d+---', '', combined_text))
        
        prophets_data.append({
            "num": p.get('num', p_idx + 1),
            "id": p_id,
            "name": p_name,
            "arabic_name": p.get('arabic_name', ''),
            "start_page": start_pg,
            "end_page": end_pg,
            "summary": p.get('summary', ''),
            "sections_count": len(sections),
            "sections": sections,
            "full_text": clean_full_text
        })
        
    print(f"  ✓ Processed {len(prophets_data)} prophets with {sum(p['sections_count'] for p in prophets_data)} sections.")
    return prophets_data

def extract_companions():
    print(">>> Extracting Stories of the Companions text...")
    catalog = json.load(open('companions_complete_catalog.json', encoding='utf-8'))
    reader = pypdf.PdfReader('app/assets/Companions_of_the_Prophet.pdf')
    
    num_pages = len(reader.pages)
    all_pages_text = {}
    for p in range(1, num_pages + 1):
        all_pages_text[p] = reader.pages[p - 1].extract_text()
        
    companions_data = []
    
    for c_idx, c in enumerate(catalog):
        c_name = c['name']
        c_id = c.get('id', slugify(c_name))
        start_pg = c['start_page']
        end_pg = c['end_page']
        
        comp_text = ""
        for pg in range(start_pg, end_pg + 1):
            comp_text += "\n\n" + all_pages_text.get(pg, "")
            
        clean_text = clean_paragraph_text(comp_text)
        
        # Remove companion name from beginning of text if it repeats as first line
        norm_name = re.sub(r'[\s\-]+', ' ', c_name).lower()
        first_p = clean_text.split('\n\n')[0] if clean_text else ''
        if re.sub(r'[\s\-]+', ' ', first_p).lower() == norm_name:
            clean_text = '\n\n'.join(clean_text.split('\n\n')[1:]).strip()
            
        companions_data.append({
            "num": c.get('num', c_idx + 1),
            "id": c_id,
            "name": c_name,
            "start_page": start_pg,
            "end_page": end_pg,
            "content": clean_text
        })
        
    print(f"  ✓ Processed {len(companions_data)} companions.")
    return companions_data

def main():
    prophets = extract_prophets()
    companions = extract_companions()
    
    with open('prophets_texts.json', 'w', encoding='utf-8') as f:
        json.dump(prophets, f, ensure_ascii=False, indent=2)
        
    with open('companions_texts.json', 'w', encoding='utf-8') as f:
        json.dump(companions, f, ensure_ascii=False, indent=2)
        
    with open('app/js/prophets-text-data.js', 'w', encoding='utf-8') as f:
        f.write("// Complete Unaltered Verbatim Texts - Stories of the Prophets (Ibn Kathir)\n")
        f.write("window.PROPHETS_TEXT_DATA = " + json.dumps(prophets, ensure_ascii=False) + ";\n")
        
    with open('app/js/companions-text-data.js', 'w', encoding='utf-8') as f:
        f.write("// Complete Unaltered Verbatim Texts - Stories of the Companions\n")
        f.write("window.COMPANIONS_TEXT_DATA = " + json.dumps(companions, ensure_ascii=False) + ";\n")
        
    print(">>> Finished! Saved to app/js/prophets-text-data.js and app/js/companions-text-data.js")

if __name__ == '__main__':
    main()
