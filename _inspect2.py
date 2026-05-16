import os, json, sys
sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

base = r'C:\tubecreate-vue\tubecli\data\edu_video_studio\projects\73fc9a4f\lessons'
lessons = sorted(os.listdir(base), key=lambda x: os.path.getmtime(os.path.join(base, x)), reverse=True)
for l in lessons[:2]:
    sf = os.path.join(base, l, 'lesson_script.json')
    if not os.path.exists(sf):
        continue
    sc = json.load(open(sf, encoding='utf-8'))
    title = sc.get('title', '?')
    print(f"Lesson: {l[:8]} | {title}")
    for s in sc.get('steps', []):
        types = [e.get('type') for e in s.get('elements', [])]
        texts = [e.get('text','')[:30] for e in s.get('elements', []) if e.get('text')]
        print(f"  Step{s['id']} clear={s.get('clear')} | types={types} | texts={texts}")
    break
