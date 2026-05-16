import os, json, sys
sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

base = r'C:\tubecreate-vue\tubecli\data\edu_video_studio\projects\73fc9a4f\lessons'
lessons = sorted(os.listdir(base), key=lambda x: os.path.getmtime(os.path.join(base, x)), reverse=True)
for l in lessons[:1]:
    sf = os.path.join(base, l, 'lesson_script.json')
    sc = json.load(open(sf, encoding='utf-8'))
    for s in sc.get('steps', []):
        for e in s.get('elements', []):
            if e.get('type') == 'math_calc':
                print(f"Step {s['id']} math_calc:")
                print(json.dumps(e, ensure_ascii=False, indent=2))
