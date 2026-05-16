import os, json

base = r'C:\tubecreate-vue\tubecli\data\edu_video_studio\projects\73fc9a4f'
pf = os.path.join(base, 'project.json')
proj = json.load(open(pf, encoding='utf-8')) if os.path.exists(pf) else {}
print("PROJECT:", proj.get('title'), "| illus_mode:", proj.get('illustration_mode', 'NOT SET in project.json'))
print("  Full project keys:", list(proj.keys()))

lessons_dir = os.path.join(base, 'lessons')
if os.path.isdir(lessons_dir):
    lessons = sorted(os.listdir(lessons_dir),
                     key=lambda x: os.path.getmtime(os.path.join(lessons_dir, x)),
                     reverse=True)[:3]
    for l in lessons:
        ldir = os.path.join(lessons_dir, l)
        sf = os.path.join(ldir, 'lesson_script.json')
        if os.path.exists(sf):
            sc = json.load(open(sf, encoding='utf-8'))
            steps = sc.get('steps', [])
            pending = sum(1 for s in steps if any(e.get('type') == 'image_generation' for e in s.get('elements', [])))
            done = sum(1 for s in steps if any(e.get('type') == 'image' and e.get('src') for e in s.get('elements', [])))
            title = sc.get('title', '?')
            print(f"  Lesson {l[:8]}: {len(steps)} steps | img_pending={pending} | img_done={done} | title={title}")
            # Show step 2 elements if exists
            if len(steps) > 1:
                s2 = steps[1]
                print(f"    Step2 clear={s2.get('clear')} elements={[e.get('type') for e in s2.get('elements',[])]}")
        jobs = [f for f in os.listdir(ldir) if 'job_' in f or 'autopilot' in f or 'chatgpt' in f]
        if jobs:
            print(f"    job files: {jobs}")
